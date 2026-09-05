import { afterEach, describe, expect, it, mock } from 'bun:test'

import { createApp, createSSRApp, defineComponent, h, nextTick, ref, type App } from 'vue'
import { renderToString } from 'vue/server-renderer'

import { createItem, type GridLayout } from 'gridla'
import {
  GridCanvas,
  GridItem,
  GridPreviewOutline,
  GridProvider,
  GridTransferScope,
  useGridLayout,
  useGridSelection,
  type GridChangeDetail,
} from 'gridla/vue'

const padding = { top: 0, right: 0, bottom: 0, left: 0 }

function layoutFixture(): GridLayout {
  return {
    canvas: { width: 1000, height: 600, padding, heightMode: 'bounded' },
    items: [
      createItem('a', { w: 500, h: 300, minW: 40, minH: 40 }, 0, 0),
      createItem('b', { w: 500, h: 300, minW: 40, minH: 40 }, 500, 0),
      createItem('c', { w: 1000, h: 300, minW: 40, minH: 40 }, 0, 300),
    ],
  }
}

type Rect = { x: number; y: number; w: number; h: number }

function rectOf(rect: Rect) {
  return {
    x: rect.x,
    y: rect.y,
    left: rect.x,
    top: rect.y,
    right: rect.x + rect.w,
    bottom: rect.y + rect.h,
    width: rect.w,
    height: rect.h,
    toJSON: () => ({}),
  }
}

function mockRect(element: Element, rect: Rect) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => rectOf(rect),
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

function key(target: Element, name: string) {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: name }))
}

const mounted: Array<{ app: App; root: HTMLElement }> = []

function mount(component: ReturnType<typeof defineComponent>) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = createApp(component)
  app.config.warnHandler = (message) => {
    throw new Error(`vue warning: ${message}`)
  }
  app.mount(root)
  mounted.push({ app, root })
  return root
}

afterEach(() => {
  for (const { app, root } of mounted.splice(0)) {
    app.unmount()
    root.remove()
  }
})

function itemEl(root: ParentNode, id: string) {
  const element = root.querySelector<HTMLElement>(`[data-gridla-item="${id}"]`)
  if (!element) throw new Error(`item ${id} not rendered`)
  return element
}

function canvasEl(root: ParentNode, index = 0) {
  const element = root.querySelectorAll<HTMLElement>('[data-gridla-canvas]')[index]
  if (!element) throw new Error(`canvas ${index} not rendered`)
  return element
}

/** A `v-model:layout` consumer with resize handles on every item. */
function controlledApp(
  initial: GridLayout,
  hooks: {
    onLayoutChange?: (layout: GridLayout, detail: GridChangeDetail) => void
    onCommit?: (detail: GridChangeDetail) => void
    onSelectedId?: (id: string | null) => void
    onItemClick?: (id: string) => void
  } = {},
) {
  const layout = ref(initial)
  const component = defineComponent({
    setup() {
      return () =>
        h(
          GridProvider,
          {
            layout: layout.value,
            'onUpdate:layout': (next: GridLayout) => {
              layout.value = next
            },
            onLayoutChange: hooks.onLayoutChange,
            onCommit: hooks.onCommit,
            'onUpdate:selectedId': hooks.onSelectedId,
            responsive: false,
          },
          () =>
            h(GridCanvas, { onItemClick: hooks.onItemClick }, () => [
              ...layout.value.items.map((item) =>
                h(GridItem, { key: item.id, id: item.id, resizeEdges: ['e', 's', 'se'] }, () => [
                  h('span', item.id),
                ]),
              ),
              h(GridPreviewOutline),
            ]),
        )
    },
  })
  return { component, layout }
}

describe('gridla/vue server rendering', () => {
  it('renders the authored layout without a DOM', async () => {
    const app = createSSRApp({
      render: () =>
        h(GridProvider, { defaultLayout: layoutFixture(), responsive: false }, () =>
          h(GridCanvas, { class: 'stage' }, () => [
            h(GridItem, { id: 'a' }, () => [h('span', 'A')]),
            h(GridItem, { id: 'b', positioning: 'absolute' }, () => [h('span', 'B')]),
            h(GridPreviewOutline),
          ]),
        ),
    })
    const html = await renderToString(app)
    expect(html).toContain('data-gridla-canvas')
    expect(html).toContain('class="stage"')
    expect(html).toContain('width:1000px;height:600px')
    expect(html).toContain('data-gridla-item="a"')
    expect(html).toContain('transform:translate(0px, 0px)')
    expect(html).toContain('data-gridla-item="b"')
    expect(html).toContain('left:500px;top:0px')
    expect(html).not.toContain('data-gridla-preview')
    expect(html).toContain('data-gridla-drag-handle="a"')
  })
})

describe('gridla/vue components', () => {
  it('positions items, marks drag handles, and renders resize handles', () => {
    const { component } = controlledApp(layoutFixture())
    const root = mount(component)
    const canvas = canvasEl(root)
    expect(canvas.getAttribute('tabindex')).toBe('0')
    const b = itemEl(root, 'b')
    expect(b.style.transform).toBe('translate(500px, 0px)')
    expect(b.style.width).toBe('500px')
    expect(b.getAttribute('data-gridla-drag-handle')).toBe('b')
    expect(b.textContent).toBe('b')
    const handles = b.querySelectorAll('[data-gridla-resize-handle="b"]')
    expect(Array.from(handles).map((el) => el.getAttribute('data-gridla-edge'))).toEqual([
      'e',
      's',
      'se',
    ])
  })

  it('commits a drag through v-model:layout and reports the strategy', async () => {
    const onLayoutChange = mock((_layout: GridLayout, _detail: GridChangeDetail) => {})
    const onCommit = mock((_detail: GridChangeDetail) => {})
    const { component, layout } = controlledApp(layoutFixture(), { onLayoutChange, onCommit })
    const root = mount(component)
    const canvas = canvasEl(root)
    const a = itemEl(root, 'a')

    pointer('pointerdown', a, 10, 10)
    pointer('pointermove', canvas, 510, 10)
    await nextTick()
    expect(a.hasAttribute('data-gridla-active')).toBe(true)
    expect(canvas.hasAttribute('data-gridla-active')).toBe(true)
    expect(a.style.transform).toBe('translate(500px, 0px)')
    const preview = root.querySelector<HTMLElement>('[data-gridla-preview]')
    expect(preview?.style.transform).toBe('translate(500px, 0px)')
    // b was pushed aside in the preview.
    expect(itemEl(root, 'b').hasAttribute('data-gridla-shifted')).toBe(true)

    pointer('pointerup', canvas, 510, 10)
    await nextTick()
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    const detail = onLayoutChange.mock.calls[0]![1]
    expect(detail).toEqual({ reason: 'move', itemId: 'a', strategy: 'push-x' })
    expect(onCommit).toHaveBeenCalledWith(detail)
    expect(layout.value.items.find((item) => item.id === 'a')?.x).toBe(500)
    expect(layout.value.items.find((item) => item.id === 'b')?.x).toBe(0)
    expect(a.style.transform).toBe('translate(500px, 0px)')
    expect(itemEl(root, 'b').style.transform).toBe('translate(0px, 0px)')
    expect(root.querySelector('[data-gridla-preview]')).toBeNull()
    expect(a.hasAttribute('data-gridla-active')).toBe(false)
  })

  it('resizes with a built-in handle', async () => {
    const onLayoutChange = mock((_layout: GridLayout, _detail: GridChangeDetail) => {})
    const { component, layout } = controlledApp(layoutFixture(), { onLayoutChange })
    const root = mount(component)
    const canvas = canvasEl(root)
    const handle = root.querySelector<HTMLElement>(
      '[data-gridla-resize-handle="a"][data-gridla-edge="s"]',
    )!
    pointer('pointerdown', handle, 250, 300)
    pointer('pointermove', canvas, 250, 260)
    pointer('pointerup', canvas, 250, 260)
    await nextTick()
    expect(onLayoutChange.mock.calls[0]![1].reason).toBe('resize')
    expect(layout.value.items.find((item) => item.id === 'a')?.h).toBe(260)
    expect(itemEl(root, 'a').style.height).toBe('260px')
  })

  it('selects on click, emits update:selectedId, and nudges with arrow keys', async () => {
    const onSelectedId = mock((_id: string | null) => {})
    const onItemClick = mock((_id: string) => {})
    // Free space around every item so a nudge is a plain move.
    const sparse: GridLayout = {
      canvas: { width: 1000, height: 600, padding, heightMode: 'bounded' },
      items: [
        createItem('a', { w: 100, h: 100 }, 0, 0),
        createItem('b', { w: 100, h: 100 }, 500, 0),
      ],
    }
    const { component, layout } = controlledApp(sparse, { onSelectedId, onItemClick })
    const root = mount(component)
    const canvas = canvasEl(root)
    const b = itemEl(root, 'b')
    pointer('pointerdown', b, 550, 10)
    pointer('pointerup', canvas, 550, 10)
    await nextTick()
    expect(onItemClick).toHaveBeenCalledWith('b')
    expect(onSelectedId).toHaveBeenCalledWith('b')
    expect(b.hasAttribute('data-gridla-selected')).toBe(true)
    key(canvas, 'ArrowDown')
    await nextTick()
    expect(layout.value.items.find((item) => item.id === 'b')?.y).toBe(8)
    expect(b.style.transform).toBe('translate(500px, 8px)')
  })

  it('follows controlled props: layout and selectedId set from outside', async () => {
    const layout = ref(layoutFixture())
    const selectedId = ref<string | null>(null)
    const Status = defineComponent({
      setup() {
        const selection = useGridSelection()
        const rendered = useGridLayout()
        return () =>
          h('p', { id: 'status' }, `${selection.value ?? 'none'} ${rendered.value.items.length}`)
      },
    })
    const root = mount(
      defineComponent({
        setup() {
          return () =>
            h(
              GridProvider,
              { layout: layout.value, selectedId: selectedId.value, responsive: false },
              () => [
                h(GridCanvas, null, () =>
                  layout.value.items.map((item) => h(GridItem, { key: item.id, id: item.id })),
                ),
                h(Status),
              ],
            )
        },
      }),
    )
    const status = root.querySelector('#status')!
    expect(status.textContent).toBe('none 3')
    selectedId.value = 'c'
    layout.value = { ...layout.value, items: layout.value.items.slice(0, 2) }
    await nextTick()
    expect(status.textContent).toBe('c 2')
    expect(root.querySelectorAll('[data-gridla-item]').length).toBe(2)
  })

  it('measures the canvas and projects the layout onto it', async () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getBoundingClientRect')
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => rectOf({ x: 0, y: 0, w: 500, h: 300 }),
    })
    try {
      const Width = defineComponent({
        setup() {
          const rendered = useGridLayout()
          return () => h('p', { id: 'width' }, String(rendered.value.canvas.width))
        },
      })
      const root = mount(
        defineComponent({
          render: () =>
            h(GridProvider, { defaultLayout: layoutFixture() }, () => [
              h(GridCanvas, null, () => [h(GridItem, { id: 'b' })]),
              h(Width),
            ]),
        }),
      )
      await nextTick()
      expect(root.querySelector('#width')?.textContent).toBe('500')
      expect(itemEl(root, 'b').style.transform).toBe('translate(250px, 0px)')
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', original)
      else
        delete (HTMLElement.prototype as { getBoundingClientRect?: unknown }).getBoundingClientRect
    }
  })

  it('moves an item between providers inside GridTransferScope', async () => {
    const left = ref<GridLayout>({
      canvas: { width: 400, height: 400, padding, heightMode: 'bounded' },
      items: [createItem('a', { w: 100, h: 100 }, 0, 0)],
    })
    const right = ref<GridLayout>({
      canvas: { width: 400, height: 400, padding, heightMode: 'bounded' },
      items: [],
    })
    const transferOut = mock((_itemId: string, _targetId: string) => {})
    const transferIn = mock((_item: unknown, _sourceId: string) => {})
    const provider = (layout: typeof left, extra: Record<string, unknown>, className: string) =>
      h(
        GridProvider,
        {
          layout: layout.value,
          'onUpdate:layout': (next: GridLayout) => {
            layout.value = next
          },
          responsive: false,
          ...extra,
        },
        () =>
          h(GridCanvas, { class: className }, () => [
            ...layout.value.items.map((item) => h(GridItem, { key: item.id, id: item.id })),
            h(GridPreviewOutline),
          ]),
      )
    const root = mount(
      defineComponent({
        setup() {
          return () =>
            h(GridTransferScope, null, () => [
              provider(left, { onTransferOut: transferOut }, 'left'),
              provider(right, { onTransferIn: transferIn }, 'right'),
            ])
        },
      }),
    )
    const leftCanvas = root.querySelector<HTMLElement>('.left')!
    const rightCanvas = root.querySelector<HTMLElement>('.right')!
    mockRect(leftCanvas, { x: 0, y: 0, w: 400, h: 400 })
    mockRect(rightCanvas, { x: 500, y: 0, w: 400, h: 400 })

    const a = itemEl(leftCanvas, 'a')
    pointer('pointerdown', a, 50, 50)
    pointer('pointermove', leftCanvas, 200, 50)
    pointer('pointermove', leftCanvas, 700, 200)
    await nextTick()
    expect(a.hasAttribute('data-gridla-transferring')).toBe(true)
    expect(a.style.opacity).toBe('0.4')
    const preview = rightCanvas.querySelector<HTMLElement>('[data-gridla-preview]')
    expect(preview?.style.transform).toBe('translate(150px, 150px)')

    pointer('pointerup', leftCanvas, 700, 200)
    await nextTick()
    expect(left.value.items).toHaveLength(0)
    expect(right.value.items[0]).toMatchObject({ id: 'a', x: 150, y: 150, w: 100, h: 100 })
    expect(transferOut).toHaveBeenCalledWith('a', expect.any(String))
    expect(transferIn).toHaveBeenCalledTimes(1)
    expect(leftCanvas.querySelectorAll('[data-gridla-item]').length).toBe(0)
    expect(itemEl(rightCanvas, 'a').style.transform).toBe('translate(150px, 150px)')
  })
})
