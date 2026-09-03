import { afterEach, describe, expect, it, mock } from 'bun:test'
import { plugin } from 'bun'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { JSX } from 'solid-js'

import { createItem, type GridLayout } from 'gridla'
import type { GridChangeDetail } from 'gridla/interaction'

// Bun resolves `solid-js` with the `node` condition and so would load Solid's
// server build, whose `render` throws. This plugin serves the browser build
// from the server build's paths instead, so every import in the process
// (including the ones inside `solid-js/h` and `solid-js/web`) shares one Solid
// instance. It must run before the imports below, hence the dynamic imports.
// The server build is exercised in a subprocess (see `solid.ssr.ts`).
const BROWSER_BUILD: Record<string, string> = { '': 'solid', 'web/': 'web', 'store/': 'store' }
plugin({
  name: 'gridla-solid-browser-build',
  setup(build) {
    build.onLoad({ filter: /solid-js\/(web\/|store\/)?dist\/server\.c?js$/ }, (args) => {
      if (args.path.endsWith('.cjs'))
        return { contents: "export * from './server.js'", loader: 'js' }
      const sub = /solid-js\/(web\/|store\/)?dist\/server\.js$/.exec(args.path)?.[1] ?? ''
      const file = args.path.replace(/server\.js$/, `${BROWSER_BUILD[sub]}.js`)
      return { contents: readFileSync(file, 'utf8'), loader: 'js' }
    })
  },
})

const { createSignal } = await import('solid-js')
const { render } = await import('solid-js/web')
const { default: h } = await import('solid-js/h')
const {
  GridCanvas,
  GridItem,
  GridPreviewOutline,
  GridProvider,
  GridTransferScope,
  useGridActions,
  useGridSelection,
} = await import('gridla/solid')

type Data = { label: string }
const padding = { top: 0, right: 0, bottom: 0, left: 0 }

function layoutFixture(): GridLayout<Data> {
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

let disposers: Array<() => void> = []

// Hyperscript returns element thunks; `render` accepts them at runtime.
function mount(ui: () => unknown) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const dispose = render(ui as () => JSX.Element, host)
  disposers.push(() => {
    dispose()
    host.remove()
  })
  return host
}

afterEach(() => {
  for (const dispose of disposers) dispose()
  disposers = []
})

function pointer(
  type: string,
  target: Element,
  x: number,
  y: number,
  extra: Record<string, unknown> = {},
) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      button: 0,
      ...extra,
    }),
  )
}

function key(target: Element, name: string, extra: Record<string, unknown> = {}) {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: name, ...extra }))
}

const item = (host: ParentNode, id: string) =>
  host.querySelector<HTMLElement>(`[data-gridla-item="${id}"]`)!
const canvasOf = (host: ParentNode) => host.querySelector<HTMLElement>('[data-gridla-canvas]')!

/** Mount a provider with the fixture and a mocked 1000x600 canvas rect. */
function setup(
  providerProps: Record<string, unknown> = {},
  itemProps: Record<string, unknown> = {},
) {
  const layout = layoutFixture()
  const onLayoutChange = mock((_layout: GridLayout<Data>, _detail: GridChangeDetail) => {})
  const onCommit = mock((_detail: GridChangeDetail) => {})
  const host = mount(() =>
    h(
      GridProvider,
      { defaultLayout: layout, responsive: false, onLayoutChange, onCommit, ...providerProps },
      h(GridCanvas, { class: 'stage' }, [
        ...layout.items.map((entry) =>
          h(
            GridItem,
            { id: entry.id, resizeEdges: ['e', 's', 'se'], ...itemProps },
            entry.data?.label,
          ),
        ),
        h(GridPreviewOutline, { class: 'outline' }),
      ]),
    ),
  )
  const canvas = canvasOf(host)
  mockRect(canvas, { x: 0, y: 0, w: 1000, h: 600 })
  return { host, canvas, onLayoutChange, onCommit }
}

describe('gridla/solid', () => {
  it('renders the canvas and items with the contract attributes and geometry', () => {
    const { host, canvas } = setup()
    expect(canvas.getAttribute('tabindex')).toBe('0')
    expect(canvas.classList.contains('stage')).toBe(true)
    expect(canvas.style.position).toBe('relative')
    expect(canvas.style.width).toBe('1000px')
    expect(canvas.hasAttribute('data-gridla-active')).toBe(false)
    const b = item(host, 'b')
    expect(b.textContent).toBe('B')
    expect(b.getAttribute('data-gridla-drag-handle')).toBe('b')
    expect(b.style.transform).toBe('translate(500px, 0px)')
    expect(b.style.width).toBe('500px')
    expect(b.style.height).toBe('300px')
    expect(b.querySelectorAll('[data-gridla-resize-handle="b"]')).toHaveLength(3)
    expect(
      b
        .querySelector('[data-gridla-resize-handle="b"][data-gridla-edge="se"]')!
        .getAttribute('style'),
    ).toContain('cursor: nwse-resize')
    expect(host.querySelector('[data-gridla-preview]')).toBeNull()
  })

  it('drags an item past the threshold, previews, and commits with the strategy', () => {
    const { host, canvas, onLayoutChange, onCommit } = setup()
    const a = item(host, 'a')
    pointer('pointerdown', a, 10, 10)
    pointer('pointermove', canvas, 12, 10)
    expect(a.hasAttribute('data-gridla-active')).toBe(false)
    pointer('pointermove', canvas, 510, 10)
    expect(a.hasAttribute('data-gridla-active')).toBe(true)
    expect(canvas.hasAttribute('data-gridla-active')).toBe(true)
    expect(a.style.transform).toBe('translate(500px, 0px)')
    expect(a.style.zIndex).toBe('2')
    expect(item(host, 'b').hasAttribute('data-gridla-shifted')).toBe(true)
    const outline = host.querySelector<HTMLElement>('[data-gridla-preview]')!
    expect(outline.classList.contains('outline')).toBe(true)
    expect(outline.style.transform).toBe('translate(500px, 0px)')
    pointer('pointerup', canvas, 510, 10)
    expect(host.querySelector('[data-gridla-preview]')).toBeNull()
    expect(a.hasAttribute('data-gridla-active')).toBe(false)
    expect(a.style.transform).toBe('translate(500px, 0px)')
    expect(item(host, 'b').style.transform).toBe('translate(0px, 0px)')
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    expect(onLayoutChange.mock.calls[0]![1]).toMatchObject({
      reason: 'move',
      itemId: 'a',
      strategy: 'push-x',
    })
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ strategy: 'push-x' }))
  })

  it('resizes from a built-in handle', () => {
    const { host, canvas, onLayoutChange } = setup()
    const handle = host.querySelector<HTMLElement>(
      '[data-gridla-resize-handle="a"][data-gridla-edge="s"]',
    )!
    pointer('pointerdown', handle, 250, 300)
    pointer('pointermove', canvas, 250, 260)
    pointer('pointerup', canvas, 250, 260)
    expect(item(host, 'a').style.height).toBe('260px')
    expect(onLayoutChange.mock.calls[0]![1].reason).toBe('resize')
  })

  it('selects on click and nudges the selected item with arrow keys', () => {
    const layout = layoutFixture()
    layout.items = [
      createItem('a', { w: 100, h: 100 }, 0, 0, { label: 'A' }),
      createItem('b', { w: 100, h: 100 }, 500, 0, { label: 'B' }),
    ]
    const { host, canvas, onLayoutChange } = setup({ defaultLayout: layout })
    const a = item(host, 'a')
    pointer('pointerdown', a, 10, 10)
    pointer('pointerup', canvas, 10, 10)
    expect(a.hasAttribute('data-gridla-selected')).toBe(true)
    expect(item(host, 'b').hasAttribute('data-gridla-selected')).toBe(false)
    key(canvas, 'ArrowRight')
    expect(onLayoutChange.mock.calls.at(-1)![0].items.find((entry) => entry.id === 'a')!.x).toBe(8)
    expect(a.style.transform).toBe('translate(8px, 0px)')
    key(canvas, 'ArrowDown', { shiftKey: true })
    expect(a.style.transform).toBe('translate(8px, 32px)')
  })

  it('round-trips a controlled layout and follows external updates', () => {
    const [layout, setLayout] = createSignal(layoutFixture())
    const onLayoutChange = mock((next: GridLayout<Data>, _detail: GridChangeDetail) =>
      setLayout(next),
    )
    const host = mount(() =>
      h(
        GridProvider,
        { layout: () => layout(), responsive: false, onLayoutChange },
        h(GridCanvas, {}, () =>
          layout().items.map((entry) => h(GridItem, { id: entry.id }, entry.data?.label)),
        ),
      ),
    )
    const canvas = canvasOf(host)
    mockRect(canvas, { x: 0, y: 0, w: 1000, h: 600 })
    pointer('pointerdown', item(host, 'a'), 10, 10)
    pointer('pointermove', canvas, 510, 10)
    pointer('pointerup', canvas, 510, 10)
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    expect(layout().items.find((entry) => entry.id === 'a')!.x).toBe(500)
    expect(item(host, 'a').style.transform).toBe('translate(500px, 0px)')

    const external = layoutFixture()
    external.items = external.items.filter((entry) => entry.id !== 'c')
    setLayout(external)
    expect(item(host, 'a').style.transform).toBe('translate(0px, 0px)')
    expect(host.querySelector('[data-gridla-item="c"]')).toBeNull()
  })

  it('exposes actions and selection as primitives and honors controlled selection', () => {
    const onSelectedIdChange = mock((_id: string | null) => {})
    let actions!: ReturnType<typeof useGridActions<Data>>
    let selection!: ReturnType<typeof useGridSelection>
    function Probe() {
      actions = useGridActions<Data>()
      selection = useGridSelection()
      return h('output', {}, () => selection() ?? 'none')
    }
    const { host, onLayoutChange } = setup({ selectedId: 'c', onSelectedIdChange }, {})
    mount(() => h(GridProvider, { defaultLayout: layoutFixture() }, h(Probe, {})))
    expect(item(host, 'c').hasAttribute('data-gridla-selected')).toBe(true)
    pointer('pointerdown', item(host, 'a'), 10, 10)
    pointer('pointerup', canvasOf(host), 10, 10)
    expect(onSelectedIdChange).toHaveBeenCalledWith('a')
    expect(actions.place({ id: 'd', w: 100, h: 100 }, { pointer: { x: 500, y: 300 } })).toBe(true)
    expect(onLayoutChange).not.toHaveBeenCalled()
    actions.select('a')
    expect(document.querySelector('output')!.textContent).toBe('a')
  })

  it('renders children through a render function with handle props', () => {
    const layout = layoutFixture()
    const host = mount(() =>
      h(
        GridProvider,
        { defaultLayout: layout, responsive: false },
        h(GridCanvas, {}, [
          h(
            GridItem,
            { id: 'a', draggable: false },
            (props: { dragHandleProps: object; view: () => { rect: { w: number } } }) => [
              h('span', { class: 'grip', ...props.dragHandleProps }, 'grip'),
              h('span', { class: 'size' }, () => String(props.view().rect.w)),
            ],
          ),
        ]),
      ),
    )
    const a = item(host, 'a')
    expect(a.hasAttribute('data-gridla-drag-handle')).toBe(false)
    expect(a.querySelector('.grip')!.getAttribute('data-gridla-drag-handle')).toBe('a')
    expect(a.querySelector('.size')!.textContent).toBe('500')
  })

  it('transfers an item between nested and outer canvases inside a GridTransferScope', () => {
    const outer: GridLayout<Data> = {
      canvas: { width: 1000, height: 600, padding, heightMode: 'bounded' },
      items: [
        createItem('group', { w: 500, h: 300 }, 0, 0, { label: 'Group' }),
        createItem('c', { w: 1000, h: 300 }, 0, 300, { label: 'C' }),
      ],
    }
    const inner: GridLayout<Data> = {
      canvas: { width: 500, height: 300, padding, heightMode: 'bounded' },
      items: [createItem('x', { w: 100, h: 100 }, 0, 0, { label: 'X' })],
    }
    const onTransferIn = mock((_item: unknown, _sourceId: string) => {})
    const onTransferOut = mock((_itemId: string, _targetId: string) => {})
    const outerChange = mock((_layout: GridLayout<Data>, _detail: GridChangeDetail) => {})
    const innerChange = mock((_layout: GridLayout<Data>, _detail: GridChangeDetail) => {})
    const host = mount(() =>
      h(
        GridTransferScope,
        {},
        h(
          GridProvider,
          { defaultLayout: outer, responsive: false, onTransferIn, onLayoutChange: outerChange },
          h(GridCanvas, { class: 'outer' }, [
            h(GridItem, { id: 'group', draggable: false }, () =>
              h(
                GridProvider,
                {
                  defaultLayout: inner,
                  responsive: false,
                  onTransferOut,
                  onLayoutChange: innerChange,
                },
                h(GridCanvas, { class: 'inner' }, h(GridItem, { id: 'x' }, 'X')),
              ),
            ),
            h(GridItem, { id: 'c' }, 'C'),
          ]),
        ),
      ),
    )
    const outerCanvas = host.querySelector<HTMLElement>('.outer')!
    const innerCanvas = host.querySelector<HTMLElement>('.inner')!
    mockRect(outerCanvas, { x: 0, y: 0, w: 1000, h: 600 })
    mockRect(innerCanvas, { x: 0, y: 0, w: 500, h: 300 })
    mockRect(item(host, 'group'), { x: 0, y: 0, w: 500, h: 300 })
    mockRect(item(host, 'c'), { x: 0, y: 300, w: 1000, h: 300 })
    const x = item(host, 'x')
    pointer('pointerdown', x, 50, 50)
    pointer('pointermove', innerCanvas, 60, 50)
    pointer('pointermove', innerCanvas, 700, 100)
    expect(x.hasAttribute('data-gridla-transferring')).toBe(true)
    expect(outerCanvas.querySelector(':scope > [data-gridla-preview]')).toBeNull()
    pointer('pointerup', innerCanvas, 700, 100)
    expect(onTransferOut).toHaveBeenCalledWith('x', expect.any(String))
    expect(onTransferIn).toHaveBeenCalledTimes(1)
    expect(outerChange.mock.calls.at(-1)![1].reason).toBe('transfer')
    expect(outerChange.mock.calls.at(-1)![0].items.map((entry) => entry.id)).toContain('x')
    expect(innerChange.mock.calls.at(-1)![1].reason).toBe('transfer')
    expect(innerChange.mock.calls.at(-1)![0].items).toHaveLength(0)
    expect(x.hasAttribute('data-gridla-transferring')).toBe(false)
  })

  it('server-renders the authored layout with the server build', () => {
    const result = Bun.spawnSync(['bun', 'run', join(import.meta.dir, 'solid.ssr.ts')], {
      cwd: dirname(dirname(import.meta.dir)),
      stdout: 'pipe',
      stderr: 'pipe',
    })
    expect(result.stderr.toString()).toBe('')
    const { html } = JSON.parse(result.stdout.toString()) as { html: string }
    expect(html).toContain('data-gridla-canvas')
    expect(html).toContain('class="stage ')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('height:480px')
    expect(html).toContain('data-gridla-item="b"')
    expect(html).toContain('translate(500px, 0px)')
    expect(html).toContain('data-gridla-resize-handle="a" data-gridla-edge="se"')
    expect(html).toContain('A &lt;em>one&lt;/em>')
    expect(html).not.toContain('class=""')
    expect(html).not.toContain('data-gridla-preview')
    expect(html).not.toContain('data-gridla-active')
  })
})
