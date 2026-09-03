import { describe, expect, it, mock } from 'bun:test'

import { createItem, type GridLayout } from 'gridla'
import {
  GridlaCanvasElement,
  GridlaItemElement,
  GridlaPreviewElement,
  GridlaTransferScopeElement,
  defineGridlaElements,
  type GridChangeDetail,
  type GridlaLayoutChangeDetail,
} from 'gridla/elements'

const padding = { top: 0, right: 0, bottom: 0, left: 0 }

function layoutFixture(): GridLayout<{ label: string }> {
  return {
    canvas: { width: 1000, height: 600, padding, heightMode: 'bounded' },
    items: [
      createItem('a', { w: 500, h: 300, minW: 40, minH: 40 }, 0, 0, { label: 'A' }),
      createItem('b', { w: 500, h: 300, minW: 40, minH: 40 }, 500, 0, { label: 'B' }),
      createItem('c', { w: 1000, h: 300, minW: 40, minH: 40 }, 0, 300, { label: 'C' }),
    ],
  }
}

function mockRect(element: Element, rect: { x: number; y: number; w: number; h: number }) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: rect.x,
      y: rect.y,
      left: rect.x,
      top: rect.y,
      right: rect.x + rect.w,
      bottom: rect.y + rect.h,
      width: rect.w,
      height: rect.h,
      toJSON: () => ({}),
    }),
  })
}

function pointer(type: string, target: Element, x: number, y: number) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      button: 0,
    }),
  )
}

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve))

/** Parse `html` into the document and return the first `<gridla-canvas>` mounted. */
async function mountHtml(html: string) {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  const canvas = host.querySelector<GridlaCanvasElement<{ label: string }>>('gridla-canvas')!
  mockRect(canvas, { x: 0, y: 0, w: 1000, h: 600 })
  canvas.layout = layoutFixture()
  await flush()
  return { host, canvas }
}

defineGridlaElements()

describe('defineGridlaElements', () => {
  it('registers the four elements idempotently and under other prefixes', () => {
    expect(customElements.get('gridla-canvas')).toBeDefined()
    expect(customElements.get('gridla-item')).toBeDefined()
    expect(customElements.get('gridla-preview')).toBeDefined()
    expect(customElements.get('gridla-transfer-scope')).toBeDefined()
    expect(() => defineGridlaElements()).not.toThrow()
    defineGridlaElements('grid')
    expect(customElements.get('grid-canvas')).toBeDefined()
    expect(document.createElement('grid-canvas')).toBeInstanceOf(GridlaCanvasElement)
    expect(document.createElement('gridla-item')).toBeInstanceOf(GridlaItemElement)
    expect(document.createElement('gridla-preview')).toBeInstanceOf(GridlaPreviewElement)
    expect(document.createElement('gridla-transfer-scope')).toBeInstanceOf(
      GridlaTransferScopeElement,
    )
  })
})

describe('<gridla-canvas>', () => {
  it('adopts declared <gridla-item> children, creates missing ones, and hides orphans', async () => {
    const { host, canvas } = await mountHtml(`
      <gridla-canvas gap="8" resize-edges="e se">
        <gridla-item item-id="a"><strong>Alpha</strong></gridla-item>
        <gridla-item item-id="b">Beta</gridla-item>
        <gridla-item item-id="zzz">Orphan</gridla-item>
        <gridla-preview></gridla-preview>
      </gridla-canvas>
    `)
    expect(canvas.hasAttribute('data-gridla-canvas')).toBe(true)
    expect(canvas.style.display).toBe('block')
    expect(canvas.handle?.controller.getConfig().gap).toBe(8)
    const a = canvas.querySelector<HTMLElement>('[data-gridla-item="a"]')!
    expect(a).toBeInstanceOf(GridlaItemElement)
    expect(a.querySelector('strong')?.textContent).toBe('Alpha')
    expect(a.style.width).toBe('500px')
    expect(a.querySelectorAll('[data-gridla-resize-handle="a"]')).toHaveLength(2)
    const c = canvas.querySelector<HTMLElement>('[data-gridla-item="c"]')!
    expect(c).toBeInstanceOf(GridlaItemElement)
    expect(c.getAttribute('item-id')).toBe('c')
    expect(c.textContent).toBe('')
    const orphan = canvas.querySelector<HTMLElement>('[item-id="zzz"]')!
    expect(orphan.hasAttribute('data-gridla-item')).toBe(false)
    const preview = canvas.querySelector<HTMLElement>('gridla-preview')!
    expect(preview.hasAttribute('data-gridla-preview')).toBe(true)
    expect(preview.style.display).toBe('none')
    host.remove()
  })

  it('reacts to attribute changes and to a late child', async () => {
    const { host, canvas } = await mountHtml(`<gridla-canvas responsive="false"></gridla-canvas>`)
    expect(canvas.style.width).toBe('1000px')
    canvas.setAttribute('gap', '16')
    expect(canvas.handle?.controller.getConfig().gap).toBe(16)
    canvas.setAttribute('resize-edges', 'se')
    expect(canvas.querySelectorAll('[data-gridla-edge="se"]')).toHaveLength(3)
    canvas.setAttribute('positioning', 'absolute')
    expect(canvas.querySelector<HTMLElement>('[data-gridla-item="b"]')!.style.left).toBe('500px')

    const next = layoutFixture()
    next.items.push(createItem('d', { w: 100, h: 100, minW: 40, minH: 40 }, 800, 400))
    const late = document.createElement('gridla-item')
    late.setAttribute('item-id', 'd')
    late.textContent = 'Delta'
    canvas.layout = next
    // The layout created a `d` element before the declared one arrived; the
    // declared one is adopted on connect and the generated one hidden.
    canvas.appendChild(late)
    const ds = canvas.querySelectorAll<HTMLElement>('[item-id="d"]')
    expect(ds).toHaveLength(2)
    expect(late.hasAttribute('data-gridla-item') || ds[0]!.hasAttribute('data-gridla-item')).toBe(
      true,
    )
    host.remove()
  })

  it('dispatches layout-change, commit, select, and item-click events', async () => {
    const { host, canvas } = await mountHtml(`<gridla-canvas responsive="false"></gridla-canvas>`)
    const layoutChange = mock((_event: Event) => {})
    const commit = mock((_event: Event) => {})
    const select = mock((_event: Event) => {})
    const click = mock((_event: Event) => {})
    canvas.addEventListener('layout-change', layoutChange)
    canvas.addEventListener('commit', commit)
    canvas.addEventListener('select', select)
    canvas.addEventListener('item-click', click)
    const detailOf = <T = unknown>(event: Event | undefined): T => (event as CustomEvent<T>).detail

    const a = canvas.querySelector<HTMLElement>('[data-gridla-item="a"]')!
    pointer('pointerdown', a, 10, 10)
    pointer('pointerup', canvas, 10, 10)
    expect(detailOf<{ itemId: string }>(select.mock.calls[0]![0])).toEqual({ itemId: 'a' })
    expect(detailOf<{ itemId: string }>(click.mock.calls[0]![0])).toEqual({ itemId: 'a' })

    pointer('pointerdown', a, 10, 10)
    pointer('pointermove', canvas, 510, 10)
    pointer('pointerup', canvas, 510, 10)
    expect(layoutChange).toHaveBeenCalledTimes(1)
    const detail = detailOf<GridlaLayoutChangeDetail<{ label: string }>>(
      layoutChange.mock.calls[0]![0],
    )
    expect(detail.change).toEqual({ reason: 'move', itemId: 'a', strategy: 'push-x' })
    expect(detail.layout.items.find((item) => item.id === 'a')?.x).toBe(500)
    expect(canvas.layout).toBe(detail.layout)
    expect(detailOf<GridChangeDetail>(commit.mock.calls[0]![0])).toEqual(detail.change)
    host.remove()
  })

  it('unmounts on disconnect and mounts again on reconnect', async () => {
    const { host, canvas } = await mountHtml(`<gridla-canvas></gridla-canvas>`)
    const handle = canvas.handle!
    const destroy = mock(handle.destroy)
    handle.destroy = destroy
    canvas.remove()
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(canvas.handle).toBeNull()
    expect(canvas.hasAttribute('data-gridla-canvas')).toBe(false)
    host.appendChild(canvas)
    await flush()
    expect(canvas.handle).not.toBeNull()
    expect(canvas.querySelectorAll('[data-gridla-item]')).toHaveLength(3)
    host.remove()
  })

  it('shares a scope through <gridla-transfer-scope> and transfers into a nested canvas', async () => {
    const host = document.createElement('div')
    host.innerHTML = `
      <gridla-transfer-scope>
        <gridla-canvas id="outer" responsive="false">
          <gridla-item item-id="c">
            <gridla-canvas id="inner" responsive="false"></gridla-canvas>
          </gridla-item>
        </gridla-canvas>
      </gridla-transfer-scope>
    `
    document.body.appendChild(host)
    const outer = host.querySelector<GridlaCanvasElement>('#outer')!
    const inner = host.querySelector<GridlaCanvasElement>('#inner')!
    mockRect(outer, { x: 0, y: 0, w: 1000, h: 600 })
    mockRect(inner, { x: 0, y: 300, w: 1000, h: 300 })
    const transferIn = mock((_event: Event) => {})
    inner.addEventListener('transfer-in', transferIn)
    outer.layout = layoutFixture()
    inner.layout = {
      canvas: { width: 1000, height: 300, padding, heightMode: 'bounded' },
      items: [createItem('c1', { w: 400, h: 300, minW: 40, minH: 40 }, 0, 0)],
    }
    await flush()
    const scope = host.querySelector<GridlaTransferScopeElement>('gridla-transfer-scope')!.scope
    expect(outer.scope).toBe(scope)
    expect(inner.scope).toBe(scope)

    const a = outer.querySelector<HTMLElement>('[data-gridla-item="a"]')!
    pointer('pointerdown', a, 10, 10)
    pointer('pointermove', outer, 20, 20)
    pointer('pointermove', outer, 700, 450)
    pointer('pointerup', outer, 700, 450)
    expect(transferIn).toHaveBeenCalledTimes(1)
    expect(outer.layout?.items.map((item) => item.id)).toEqual(['b', 'c'])
    expect(inner.layout?.items.map((item) => item.id)).toEqual(['c1', 'a'])
    expect(inner.querySelector('[data-gridla-item="a"]')).toBeInstanceOf(GridlaItemElement)
    host.remove()
  })
})
