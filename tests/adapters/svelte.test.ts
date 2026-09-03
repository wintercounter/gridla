import { afterEach, describe, expect, it, mock } from 'bun:test'

import { createItem, type GridItem as GridItemModel, type GridLayout } from 'gridla'
import type { GridChangeDetail } from 'gridla/interaction'

import { svelte } from '../setup/svelte-runtime'
import Bound from './fixtures/SvelteBound.svelte'
import Dashboard from './fixtures/SvelteDashboard.svelte'
import Nested from './fixtures/SvelteNested.svelte'

/**
 * `gridla/svelte` unit suite. Client behavior mounts the fixtures with Svelte's
 * `mount` on happy-dom (element rects are mocked, as in `tests/interaction`);
 * server output comes from `render` in a child process compiled for the
 * server target (see `tests/setup/svelte.ts`).
 */

const { flushSync, mount, unmount } = svelte
const ROOT = new URL('../..', import.meta.url).pathname

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

function mockRect(element: Element, rect: Rect) {
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
  flushSync()
}

function key(target: Element, name: string, extra: Record<string, unknown> = {}) {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: name, ...extra }))
  flushSync()
}

/** Drag from the drag surface of `item` to `(x, y)` in client pixels and release. */
function drag(canvas: Element, item: Element, from: [number, number], to: [number, number]) {
  pointer('pointerdown', item, from[0], from[1])
  pointer('pointermove', canvas, from[0] + 2, from[1])
  pointer('pointermove', canvas, to[0], to[1])
  pointer('pointerup', canvas, to[0], to[1])
}

const mounted: Array<Record<string, unknown>> = []
const targets: HTMLElement[] = []

function mountFixture<T extends Record<string, unknown>>(
  component: Parameters<typeof mount>[0],
  props: T,
) {
  const target = document.createElement('div')
  document.body.appendChild(target)
  const instance = mount(component, { target, props }) as Record<string, unknown>
  flushSync()
  mounted.push(instance)
  targets.push(target)
  return { target, instance }
}

afterEach(() => {
  for (const instance of mounted.splice(0)) void unmount(instance)
  for (const target of targets.splice(0)) target.remove()
})

function itemOf(target: Element, id: string) {
  const element = target.querySelector<HTMLElement>(`[data-gridla-item="${id}"]`)
  if (!element) throw new Error(`item ${id} not rendered`)
  return element
}

function translateOf(element: HTMLElement): [number, number] {
  const match = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(element.style.transform)
  if (!match) throw new Error(`no translate on ${element.outerHTML}`)
  return [Number(match[1]), Number(match[2])]
}

describe('gridla/svelte server rendering', () => {
  it('renders the authored layout with the contract data attributes', () => {
    const proc = Bun.spawnSync({
      cmd: [
        'bun',
        '--preload',
        './tests/setup/svelte.ts',
        'tests/adapters/fixtures/svelte-ssr.ts',
        JSON.stringify(layoutFixture()),
      ],
      cwd: ROOT,
      env: { ...process.env, GRIDLA_SVELTE_GENERATE: 'server' },
    })
    expect(proc.exitCode).toBe(0)
    const { body } = JSON.parse(proc.stdout.toString()) as { body: string }
    expect(body).toContain('data-gridla-canvas=""')
    expect(body).toContain('data-gridla-item="a"')
    expect(body).toContain('data-gridla-drag-handle="b"')
    expect(body).toContain('data-gridla-resize-handle="c" data-gridla-edge="se"')
    // Items sit where the layout says; the canvas keeps the authored size when not responsive.
    expect(body).toContain('transform:translate(500px, 0px)')
    expect(body).toContain('transform:translate(0px, 300px)')
    expect(body).toContain('width:1000px;height:600px')
    expect(body).not.toContain('data-gridla-preview')
    expect(body).not.toContain('data-gridla-selected')
  })
})

describe('gridla/svelte client', () => {
  it('mounts items with geometry and data attributes', () => {
    const { target } = mountFixture(Dashboard, {
      defaultLayout: layoutFixture(),
      ids: ['a', 'b', 'c'],
    })
    const canvas = target.querySelector('[data-gridla-canvas]')
    expect(canvas).not.toBeNull()
    expect(canvas?.getAttribute('tabindex')).toBe('0')
    expect(target.querySelectorAll('[data-gridla-item]')).toHaveLength(3)
    const b = itemOf(target, 'b')
    expect(translateOf(b)).toEqual([500, 0])
    expect(b.style.width).toBe('500px')
    expect(b.getAttribute('data-gridla-drag-handle')).toBe('b')
    expect(b.querySelectorAll('[data-gridla-resize-handle="b"]')).toHaveLength(3)
    expect(b.textContent).toContain('500,0')
    expect(target.querySelector('[data-gridla-preview]')).toBeNull()
  })

  it('commits a drag with the solver strategy and updates the DOM', () => {
    const onLayoutChange = mock((_layout: GridLayout, _detail: GridChangeDetail) => {})
    const onCommit = mock((_detail: GridChangeDetail) => {})
    const { target } = mountFixture(Dashboard, {
      defaultLayout: layoutFixture(),
      ids: ['a', 'b', 'c'],
      onLayoutChange,
      onCommit,
    })
    const canvas = target.querySelector<HTMLElement>('[data-gridla-canvas]')!
    mockRect(canvas, { x: 0, y: 0, w: 1000, h: 600 })
    const a = itemOf(target, 'a')

    pointer('pointerdown', a, 10, 10)
    pointer('pointermove', canvas, 12, 10)
    expect(a.hasAttribute('data-gridla-active')).toBe(false)
    pointer('pointermove', canvas, 510, 10)
    expect(a.hasAttribute('data-gridla-active')).toBe(true)
    expect(canvas.hasAttribute('data-gridla-active')).toBe(true)
    expect(translateOf(a)).toEqual([500, 0])
    expect(target.querySelector('[data-gridla-preview]')).not.toBeNull()
    pointer('pointerup', canvas, 510, 10)

    expect(onCommit).toHaveBeenCalledTimes(1)
    const detail = onCommit.mock.calls[0]![0]
    expect(detail.reason).toBe('move')
    expect(detail.itemId).toBe('a')
    expect(typeof detail.strategy).toBe('string')
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    const next = onLayoutChange.mock.calls[0]![0]
    expect(next.items.find((item) => item.id === 'a')?.x).toBe(500)
    expect(translateOf(a)).toEqual([500, 0])
    expect(a.hasAttribute('data-gridla-active')).toBe(false)
    expect(target.querySelector('[data-gridla-preview]')).toBeNull()
  })

  it('resizes through a built-in handle', () => {
    const onCommit = mock((_detail: GridChangeDetail) => {})
    const { target } = mountFixture(Dashboard, {
      defaultLayout: layoutFixture(),
      ids: ['a', 'b', 'c'],
      onCommit,
    })
    const canvas = target.querySelector<HTMLElement>('[data-gridla-canvas]')!
    mockRect(canvas, { x: 0, y: 0, w: 1000, h: 600 })
    const handle = target.querySelector<HTMLElement>(
      '[data-gridla-resize-handle="a"][data-gridla-edge="s"]',
    )!
    pointer('pointerdown', handle, 250, 300)
    pointer('pointermove', canvas, 250, 200)
    pointer('pointerup', canvas, 250, 200)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit.mock.calls[0]![0]).toMatchObject({ reason: 'resize', itemId: 'a' })
    expect(itemOf(target, 'a').style.height).toBe('200px')
  })

  it('selects on click and nudges the selection with the keyboard', () => {
    const onItemClick = mock((_id: string) => {})
    const onLayoutChange = mock((_layout: GridLayout, _detail: GridChangeDetail) => {})
    // Two items: `b` can give way when `a` moves right, then down.
    const layout = layoutFixture()
    layout.items = layout.items.filter((item) => item.id !== 'c')
    const { target } = mountFixture(Dashboard, {
      defaultLayout: layout,
      ids: ['a', 'b'],
      onItemClick,
      onLayoutChange,
    })
    const canvas = target.querySelector<HTMLElement>('[data-gridla-canvas]')!
    mockRect(canvas, { x: 0, y: 0, w: 1000, h: 600 })
    const a = itemOf(target, 'a')
    pointer('pointerdown', a, 10, 10)
    pointer('pointerup', a, 10, 10)
    expect(onItemClick).toHaveBeenCalledWith('a')
    expect(a.hasAttribute('data-gridla-selected')).toBe(true)
    expect(itemOf(target, 'b').hasAttribute('data-gridla-selected')).toBe(false)

    key(canvas, 'ArrowRight')
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    expect(onLayoutChange.mock.calls[0]![1]).toMatchObject({ reason: 'move', itemId: 'a' })
    expect(translateOf(a)).toEqual([8, 0])
    key(canvas, 'ArrowDown', { shiftKey: true })
    expect(translateOf(a)[1]).toBe(32)
  })

  it('round-trips a bound layout in both directions', () => {
    const onLayoutChange = mock((_layout: GridLayout, _detail: GridChangeDetail) => {})
    const { target, instance } = mountFixture(Bound, { initial: layoutFixture(), onLayoutChange })
    const canvas = target.querySelector<HTMLElement>('[data-gridla-canvas]')!
    mockRect(canvas, { x: 0, y: 0, w: 1000, h: 600 })
    const json = () => target.querySelector('[data-testid="json"]')!.textContent

    // Child to parent: a committed move lands in the parent's state.
    drag(canvas, itemOf(target, 'a'), [10, 10], [510, 10])
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    const bound = (instance.getLayout as () => GridLayout)()
    expect(bound.items.find((item) => item.id === 'a')?.x).toBe(500)
    expect(json()).toContain('["a",500,0]')
    expect(translateOf(itemOf(target, 'a'))).toEqual([500, 0])

    // Parent to child: replacing the bound layout re-renders the items.
    const reset = layoutFixture()
    ;(instance.setLayout as (next: GridLayout) => void)(reset)
    flushSync()
    expect(json()).toContain('["a",0,0]')
    expect(translateOf(itemOf(target, 'a'))).toEqual([0, 0])
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
  })

  it('transfers an item from the outer canvas into a nested one and back', () => {
    const onOuterChange = mock((_layout: GridLayout) => {})
    const onInnerChange = mock((_layout: GridLayout) => {})
    const onTransferOut = mock((_itemId: string, _targetId: string) => {})
    const onTransferIn = mock((_item: GridItemModel, _sourceId: string) => {})
    const outer: GridLayout = {
      canvas: { width: 1000, height: 600, padding, heightMode: 'bounded' },
      items: [
        createItem('a', { w: 300, h: 200 }, 0, 0),
        createItem('group', { w: 500, h: 600 }, 500, 0),
      ],
    }
    const inner: GridLayout = {
      canvas: { width: 500, height: 600, padding, heightMode: 'bounded' },
      items: [],
    }
    const { target, instance } = mountFixture(Nested, {
      outer,
      inner,
      onOuterChange,
      onInnerChange,
      onTransferOut,
      onTransferIn,
    })
    const outerCanvas = target.querySelector<HTMLElement>('.outer')!
    const innerCanvas = target.querySelector<HTMLElement>('.inner')!
    mockRect(outerCanvas, { x: 0, y: 0, w: 1000, h: 600 })
    mockRect(itemOf(target, 'group'), { x: 500, y: 0, w: 500, h: 600 })
    mockRect(innerCanvas, { x: 500, y: 0, w: 500, h: 600 })
    mockRect(itemOf(target, 'a'), { x: 0, y: 0, w: 300, h: 200 })

    const a = itemOf(target, 'a')
    pointer('pointerdown', a, 50, 50)
    pointer('pointermove', outerCanvas, 60, 50)
    pointer('pointermove', outerCanvas, 750, 300)
    expect(a.hasAttribute('data-gridla-transferring')).toBe(true)
    expect(innerCanvas.querySelector('[data-gridla-preview]')).toBeNull()
    pointer('pointerup', outerCanvas, 750, 300)

    expect(onTransferOut).toHaveBeenCalledWith('a', 'inner')
    expect(onTransferIn).toHaveBeenCalledTimes(1)
    expect(onOuterChange.mock.calls.at(-1)?.[0].items.map((item) => item.id)).toEqual(['group'])
    const arrived = onInnerChange.mock.calls.at(-1)?.[0].items
    expect(arrived?.map((item) => item.id)).toEqual(['a'])
    expect(arrived?.[0]).toMatchObject({ w: 300, h: 200 })

    expect(onTransferIn.mock.calls.at(-1)).toEqual([expect.objectContaining({ id: 'a' }), 'outer'])
    // The bound layouts followed the transfer and the item now renders inside the group.
    const moved = innerCanvas.querySelector<HTMLElement>('[data-gridla-item="a"]')
    expect(moved).not.toBeNull()
    expect(outerCanvas.querySelectorAll(':scope > [data-gridla-item]')).toHaveLength(1)
    expect((instance.getInner as () => GridLayout)().items.map((item) => item.id)).toEqual(['a'])

    // And back: drag it from the nested canvas into the outer canvas' free space.
    const placed = arrived![0]!
    mockRect(moved!, { x: 500 + placed.x, y: placed.y, w: 300, h: 200 })
    const grab: [number, number] = [500 + placed.x + 20, placed.y + 20]
    pointer('pointerdown', moved!, grab[0], grab[1])
    pointer('pointermove', innerCanvas, grab[0] + 10, grab[1])
    pointer('pointermove', innerCanvas, 150, 400)
    pointer('pointerup', innerCanvas, 150, 400)
    expect(onTransferOut).toHaveBeenLastCalledWith('a', 'outer')
    expect((instance.getInner as () => GridLayout)().items).toHaveLength(0)
    expect((instance.getOuter as () => GridLayout)().items.map((item) => item.id)).toEqual([
      'group',
      'a',
    ])
    expect(outerCanvas.querySelectorAll(':scope > [data-gridla-item]')).toHaveLength(2)
  })
})
