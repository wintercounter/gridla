/**
 * Obscura compatibility spike.
 *
 * Launches the pinned Obscura binary (see PIN.md), connects Playwright over CDP,
 * and probes the browser features the Gridla e2e suites rely on, one by one.
 * Each probe is isolated: a failure (or a hang, guarded by a timeout) is recorded
 * with its error text and the next probe still runs.
 *
 * Run:   node tests/e2e/obscura/spike.ts        (Node >= 22.6 strips types)
 *
 * NOTE: run this with Node, not Bun. Under Bun 1.3.x Playwright's bundled `ws`
 * client never completes the CDP WebSocket handshake with Obscura (a raw Bun
 * WebSocket to the same endpoint works), so `chromium.connectOverCDP` hangs.
 * `bunx playwright test` executes the runner under Node anyway.
 *
 * Env:   OBSCURA_BIN   path to the launcher (default .tools/obscura/run.sh)
 *        OBSCURA_PORT  CDP port (default 9222)
 *        SPIKE_OUT     where to write the markdown table
 *                      (default tests/e2e/obscura/CAPABILITIES.md)
 *        SPIKE_BROWSER "chromium" runs the same probes against a launched
 *                      Chromium instead, as a control (CHROMIUM_PATH overrides
 *                      the executable, e.g. /usr/bin/chromium on Alpine).
 */
import { chromium, type Browser, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../..')
const bin = process.env.OBSCURA_BIN ?? resolve(root, '.tools/obscura/run.sh')
const cdpPort = Number(process.env.OBSCURA_PORT ?? 9222)
const out = process.env.SPIKE_OUT ?? resolve(here, 'CAPABILITIES.md')
const control = process.env.SPIKE_BROWSER === 'chromium'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const PROBE_TIMEOUT = 15_000
const GENERATED_END = '<!-- /generated -->'

// ---------------------------------------------------------------- fixture page
const html = /* html */ `<!doctype html>
<html><head><meta charset="utf-8"><title>spike</title>
<style>
  body { margin: 0; }
  #box { position: absolute; left: 20px; top: 30px; width: 100px; height: 50px; background: #48f; }
  #tx { position: absolute; left: 200px; top: 30px; width: 80px; height: 40px; background: #f84; }
  #ro { width: 100px; height: 20px; background: #4f8; }
</style></head>
<body>
  <div id="box"></div>
  <div id="tx"></div>
  <div id="ro"></div>
  <input id="inp" />
  <script type="module">
    import { answer } from './mod.js'
    window.__module = answer
  </script>
  <script>
    window.__events = []
    const box = document.getElementById('box')
    for (const t of ['pointerdown', 'pointermove', 'pointerup']) {
      box.addEventListener(t, (e) => {
        window.__events.push({ type: t, x: e.clientX, y: e.clientY, pointerId: e.pointerId, pointerType: e.pointerType, buttons: e.buttons })
      })
    }
  </script>
</body></html>`
const mod = `export const answer = 42`

const server = createServer((req, res) => {
  if (req.url === '/mod.js') {
    res.writeHead(200, { 'content-type': 'text/javascript' }).end(mod)
    return
  }
  res.writeHead(200, { 'content-type': 'text/html' }).end(html)
})
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
const pageUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/`

// -------------------------------------------------------------- launch engine
let proc: ChildProcess | undefined
let endpoint: string
if (control) {
  endpoint = process.env.CHROMIUM_PATH ?? 'bundled chromium'
} else {
  proc = spawn(bin, ['serve', '--port', String(cdpPort), '--allow-private-network', '--quiet'], { stdio: 'ignore' })
  endpoint = `http://127.0.0.1:${cdpPort}`
  const deadline = Date.now() + 20_000
  let ready = false
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${endpoint}/json/version`)
      if (r.ok) {
        ready = true
        break
      }
    } catch {}
    await sleep(200)
  }
  if (!ready) {
    console.error('Obscura did not expose /json/version in time')
    proc.kill()
    process.exit(1)
  }
}

// ---------------------------------------------------------------- harness
type Result = { name: string; ok: boolean; detail: string }
const results: Result[] = []
let browser: Browser | undefined
let page: Page | undefined

async function probe(name: string, fn: () => Promise<string | void>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const detail = await Promise.race([
      fn(),
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error(`probe timed out after ${PROBE_TIMEOUT}ms`)), PROBE_TIMEOUT)
      }),
    ])
    results.push({ name, ok: true, detail: (detail ?? 'ok').toString() })
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).split('\n')[0].slice(0, 220)
    results.push({ name, ok: false, detail: msg })
  } finally {
    clearTimeout(timer)
  }
  const r = results[results.length - 1]
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${name}  ${r.detail}`)
}

const need = () => {
  if (!page) throw new Error('no page (connect or load failed)')
  return page
}

// ---------------------------------------------------------------- probes
await probe('connectOverCDP', async () => {
  browser = control
    ? await chromium.launch({ executablePath: process.env.CHROMIUM_PATH })
    : await chromium.connectOverCDP(endpoint)
  const v = browser.version()
  const ctx = browser.contexts()[0] ?? (await browser.newContext())
  page = await ctx.newPage()
  return `version=${v} contexts=${browser.contexts().length}`
})

await probe('goto static HTML (local http server)', async () => {
  const res = await need().goto(pageUrl, { waitUntil: 'load' })
  const title = await need().title()
  return `status=${res?.status()} title=${title}`
})

await probe('ES module <script type=module>', async () => {
  await need().waitForFunction(() => (window as any).__module !== undefined, null, { timeout: 5000 })
  const v = await need().evaluate(() => (window as any).__module)
  if (v !== 42) throw new Error(`expected 42, got ${v}`)
})

await probe('page.evaluate', async () => {
  const v = await need().evaluate(({ a, b }) => ({ sum: a + b, ua: navigator.userAgent.slice(0, 40) }), { a: 1, b: 2 })
  if (v.sum !== 3) throw new Error(`bad result ${JSON.stringify(v)}`)
  return JSON.stringify(v)
})

await probe('getBoundingClientRect', async () => {
  const r = await need().evaluate(() => {
    const b = document.getElementById('box')!.getBoundingClientRect()
    return { x: b.x, y: b.y, w: b.width, h: b.height }
  })
  if (r.x !== 20 || r.y !== 30 || r.w !== 100 || r.h !== 50) throw new Error(`unexpected rect ${JSON.stringify(r)}`)
  return JSON.stringify(r)
})

await probe('page.screenshot', async () => {
  const buf = await need().screenshot({ type: 'png' })
  if (buf.length < 100 || buf[1] !== 0x50) throw new Error(`not a PNG (${buf.length} bytes)`)
  return `${buf.length} bytes png`
})

await probe('page.mouse move/down/up -> pointer events', async () => {
  const p = need()
  await p.evaluate(() => ((window as any).__events = []))
  await p.mouse.move(40, 40)
  await p.mouse.down()
  await p.mouse.move(60, 50, { steps: 3 })
  await p.mouse.up()
  const ev = (await p.evaluate(() => (window as any).__events)) as { type: string; x: number; y: number; buttons: number }[]
  const types = ev.map((e) => e.type)
  const has = (t: string) => types.includes(t)
  if (!has('pointerdown') || !has('pointermove') || !has('pointerup')) throw new Error(`events=${JSON.stringify(ev).slice(0, 200)}`)
  const down = ev.find((e) => e.type === 'pointerdown')!
  const moveAfterDown = ev.some((e, i) => e.type === 'pointermove' && i > ev.indexOf(down))
  if (!moveAfterDown) throw new Error(`no pointermove after pointerdown: ${types.join(',')}`)
  if (down.buttons !== 1) throw new Error(`pointerdown.buttons=${down.buttons}, expected 1`)
  return `${types.join(',')} down@${down.x},${down.y}`
})

await probe('page.keyboard.type', async () => {
  const p = need()
  await p.click('#inp')
  await p.keyboard.type('hello')
  const v = await p.inputValue('#inp')
  if (v !== 'hello') throw new Error(`input value "${v}"`)
})

await probe('ResizeObserver fires after style change', async () => {
  const r = await need().evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const el = document.getElementById('ro')!
        const sizes: string[] = []
        const ro = new ResizeObserver((entries) => {
          for (const e of entries) sizes.push(`${e.contentRect.width}x${e.contentRect.height}`)
          if (sizes.length >= 2) {
            ro.disconnect()
            resolve(sizes.join(' -> '))
          }
        })
        ro.observe(el)
        setTimeout(() => {
          el.style.width = '150px'
        }, 50)
        setTimeout(() => reject(new Error(`only ${sizes.length} RO callback(s): ${sizes.join(',')}`)), 3000)
      }),
  )
  if (!r.endsWith('150x20')) throw new Error(`unexpected sizes ${r}`)
  return r
})

await probe('requestAnimationFrame', async () => {
  const r = await need().evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const t0 = performance.now()
        let n = 0
        const tick = (ts: number) => {
          n++
          if (n >= 3) resolve(`3 frames in ${Math.round(performance.now() - t0)}ms, ts=${Math.round(ts)}`)
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
        setTimeout(() => reject(new Error(`only ${n} rAF callbacks in 3s`)), 3000)
      }),
  )
  return r
})

await probe('setPointerCapture / hasPointerCapture', async () => {
  const p = need()
  const r = await p.evaluate(() => {
    const el = document.getElementById('box')!
    const log: string[] = []
    el.addEventListener('gotpointercapture', () => log.push('got'))
    el.addEventListener('lostpointercapture', () => log.push('lost'))
    ;(window as any).__cap = { el, log }
    return typeof el.setPointerCapture
  })
  if (r !== 'function') throw new Error(`setPointerCapture is ${r}`)
  await p.evaluate(() => {
    const { el } = (window as any).__cap
    el.addEventListener(
      'pointerdown',
      (e: PointerEvent) => {
        el.setPointerCapture(e.pointerId)
        ;(window as any).__cap.has = el.hasPointerCapture(e.pointerId)
      },
      { once: true },
    )
  })
  await p.mouse.move(40, 40)
  await p.mouse.down()
  await p.mouse.move(400, 300)
  await p.mouse.up()
  const res = await p.evaluate(() => ({ has: (window as any).__cap.has, log: (window as any).__cap.log }))
  if (res.has !== true) throw new Error(`hasPointerCapture=${res.has} log=${res.log}`)
  return `hasPointerCapture=true events=${res.log.join(',') || '(none)'}`
})

await probe('CSS transform reflected in getBoundingClientRect', async () => {
  const r = await need().evaluate(() => {
    const el = document.getElementById('tx')!
    const before = el.getBoundingClientRect()
    el.style.transform = 'translate(50px, 10px) scale(2)'
    const after = el.getBoundingClientRect()
    return { bx: before.x, by: before.y, ax: after.x, ay: after.y, aw: after.width, ah: after.height }
  })
  // scale(2) around centre of 80x40 at (200,30): width 160, x = 200 - 40 + 50 = 210, y = 30 - 20 + 10 = 20
  if (Math.abs(r.aw - 160) > 1 || Math.abs(r.ax - 210) > 1 || Math.abs(r.ay - 20) > 1) throw new Error(`rect ${JSON.stringify(r)}`)
  return JSON.stringify(r)
})

await probe("matchMedia('(prefers-color-scheme: dark)')", async () => {
  const r = await need().evaluate(() => {
    const m = window.matchMedia('(prefers-color-scheme: dark)')
    return { matches: m.matches, media: m.media, hasListener: typeof m.addEventListener }
  })
  if (r.hasListener !== 'function') throw new Error(JSON.stringify(r))
  return JSON.stringify(r)
})

await probe('localStorage', async () => {
  const r = await need().evaluate(() => {
    localStorage.setItem('gridla-spike', 'v1')
    const v = localStorage.getItem('gridla-spike')
    localStorage.removeItem('gridla-spike')
    return v
  })
  if (r !== 'v1') throw new Error(`got ${r}`)
})

await probe('PointerEvent constructor carries clientX/pointerId', async () => {
  const r = await need().evaluate(() => {
    const has = typeof PointerEvent
    if (has !== 'function') return { has }
    const e = new PointerEvent('pointerdown', { clientX: 40, clientY: 41, pointerId: 7, buttons: 1, bubbles: true })
    return { has, clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId, buttons: e.buttons, onpointerdown: 'onpointerdown' in window }
  })
  if (r.has !== 'function' || r.clientX !== 40 || r.pointerId !== 7) throw new Error(JSON.stringify(r))
  return JSON.stringify(r)
})

await probe('raw CDP Input.dispatchMouseEvent -> pointer events (bypasses setInterceptDrags)', async () => {
  const p = need()
  await p.evaluate(() => {
    ;(window as any).__events = []
    for (const t of ['mousedown', 'mousemove', 'mouseup'])
      document.getElementById('box')!.addEventListener(t, (e) => (window as any).__events.push({ type: t, x: (e as MouseEvent).clientX }))
  })
  const s = await p.context().newCDPSession(p)
  try {
    await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 40, y: 40, buttons: 0 })
    await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 40, y: 40, button: 'left', buttons: 1, clickCount: 1 })
    await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 70, y: 55, button: 'left', buttons: 1 })
    await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 70, y: 55, button: 'left', buttons: 0, clickCount: 1 })
  } finally {
    await s.detach().catch(() => {})
  }
  const types = (await p.evaluate(() => (window as any).__events.map((e: unknown) => e.type))) as string[]
  const ok = ['pointerdown', 'pointermove', 'pointerup'].every((t) => types.includes(t))
  if (!ok) throw new Error(`no pointer events; got: ${types.join(',') || '(none)'}`)
  return types.join(',')
})

await probe('locator.click({ force: true }) + locator.hover', async () => {
  const p = need()
  await p.evaluate(() => ((window as any).__events = []))
  await p.locator('#box').click({ force: true, timeout: 8000 })
  await p.locator('#box').hover({ timeout: 8000 })
  const types = (await p.evaluate(() => (window as any).__events.map((e: unknown) => e.type))) as string[]
  return `events=${types.join(',') || '(none)'}`
})

await probe('page.focus + keyboard.type (no click)', async () => {
  const p = need()
  await p.evaluate(() => ((document.getElementById('inp') as HTMLInputElement).value = ''))
  await p.focus('#inp')
  await p.keyboard.type('abc')
  await p.keyboard.press('Backspace')
  const v = await p.inputValue('#inp')
  if (v !== 'ab') throw new Error(`input value "${v}"`)
  return `value="${v}"`
})

await probe('locator.fill', async () => {
  const p = need()
  await p.locator('#inp').fill('filled', { timeout: 8000 })
  const v = await p.inputValue('#inp')
  if (v !== 'filled') throw new Error(`input value "${v}"`)
})

await probe('page.setContent', async () => {
  const p = need()
  await p.setContent('<p id="sc">set</p>', { timeout: 8000 })
  const t = await p.textContent('#sc')
  await p.goto(pageUrl)
  if (t !== 'set') throw new Error(`textContent ${t}`)
})

await probe('page.setViewportSize -> innerWidth/innerHeight', async () => {
  const p = need()
  await p.setViewportSize({ width: 777, height: 555 })
  const r = await p.evaluate(() => ({ w: innerWidth, h: innerHeight, dw: document.documentElement.clientWidth }))
  if (r.w !== 777 || r.h !== 555) throw new Error(`viewport reports ${JSON.stringify(r)}`)
  return JSON.stringify(r)
})

await probe('CDP Emulation.setDeviceMetricsOverride (what setViewportSize uses)', async () => {
  const p = need()
  const s = await p.context().newCDPSession(p)
  const r = await s.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 480, deviceScaleFactor: 1, mobile: false })
  const v = await p.evaluate(() => ({ w: innerWidth, h: innerHeight }))
  await s.detach().catch(() => {})
  if (v.w !== 640 || v.h !== 480) throw new Error(`override accepted (${JSON.stringify(r)}) but viewport is ${JSON.stringify(v)}`)
  return `ok -> ${JSON.stringify(v)}`
})

await probe('CDP Browser.getWindowForTarget (headed viewport path)', async () => {
  const p = need()
  const s = await p.context().newCDPSession(p)
  try {
    const r = (await s.send('Browser.getWindowForTarget' as any)) as any
    return JSON.stringify(r).slice(0, 120)
  } finally {
    await s.detach().catch(() => {})
  }
})

await probe('newContext + newPage (isolated context)', async () => {
  const ctx = await browser!.newContext({ viewport: { width: 500, height: 400 } })
  const p2 = await ctx.newPage()
  await p2.goto(pageUrl)
  const r = await p2.evaluate(() => ({ w: innerWidth, h: innerHeight }))
  await ctx.close()
  if (r.w !== 500) throw new Error(`context viewport ${JSON.stringify(r)}`)
  return JSON.stringify(r)
})

await probe('locator.click + toHaveCount style query', async () => {
  const p = need()
  await p.evaluate(() => ((window as any).__events = []))
  await p.locator('#box').click()
  const n = await p.locator('#box').count()
  const ev = (await p.evaluate(() => (window as any).__events.map((e: unknown) => e.type))) as string[]
  if (n !== 1 || !ev.includes('pointerdown')) throw new Error(`count=${n} events=${ev}`)
  return `count=${n} events=${ev.join(',')}`
})

// ---------------------------------------------------------------- teardown
try {
  await browser?.close()
} catch {}
proc?.kill()
server.close()

// ---------------------------------------------------------------- report
const version = results[0]?.detail ?? ''
const passed = results.filter((r) => r.ok).length
const lines = [
  `<!-- generated by tests/e2e/obscura/spike.ts on ${new Date().toISOString().slice(0, 10)} -->`,
  `# Obscura capability probe`,
  ``,
  `Engine: ${control ? `Chromium control run (${endpoint}, ${version})` : `Obscura v0.2.1 via \`${bin}\` (${version})`}`,
  `Playwright: 1.62.1 under ${process.versions.bun ? `Bun ${process.versions.bun}` : `Node ${process.versions.node}`}, ${control ? 'launched directly' : 'connected with `chromium.connectOverCDP`'}. ${passed}/${results.length} probes passed.`,
  ``,
  `| Probe | Result | Detail |`,
  `| --- | --- | --- |`,
  ...results.map((r) => `| ${r.name} | ${r.ok ? 'PASS' : 'FAIL'} | ${r.detail.replace(/\|/g, '\\|')} |`),
  ``,
  GENERATED_END,
]
// Keep any hand-written analysis that follows the generated block.
let tail = ''
try {
  const prev = await readFile(out, 'utf8')
  const i = prev.indexOf(GENERATED_END)
  if (i >= 0) tail = prev.slice(i + GENERATED_END.length)
} catch {}
await writeFile(out, lines.join('\n') + tail)
console.log(`\n${passed}/${results.length} passed -> ${out}`)
process.exit(0)
