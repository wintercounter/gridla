import { describe, expect, it, mock } from 'bun:test'

import { createItem, type GridLayout } from 'gridla'
import {
  GRID_DATA,
  createGridController,
  createPointerGesture,
  type GridChangeDetail,
} from 'gridla/interaction'

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

/** A canvas element with one child per item, each a drag surface with e/s/se resize handles. */
function mount(layout: GridLayout) {
  const canvas = document.createElement('div')
  canvas.setAttribute('data-gridla-canvas', '')
  mockRect(canvas, { x: 0, y: 0, w: layout.canvas.width, h: layout.canvas.height })
  const items = new Map<string, HTMLElement>()
  const handles = new Map<string, HTMLElement>()
  for (const item of layout.items) {
    const element = document.createElement('div')
    element.setAttribute(GRID_DATA.item, item.id)
    element.setAttribute(GRID_DATA.dragHandle, item.id)
    for (const edge of ['e', 's', 'se']) {
      const handle = document.createElement('div')
      handle.setAttribute(GRID_DATA.resizeHandle, item.id)
      handle.setAttribute(GRID_DATA.edge, edge)
      element.appendChild(handle)
      handles.set(`${item.id}:${edge}`, handle)
    }
    canvas.appendChild(element)
    items.set(item.id, element)
  }
  document.body.appendChild(canvas)
  return { canvas, items, handles }
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
}

function key(target: Element, key: string, extra: Record<string, unknown> = {}) {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key, ...extra }))
}

function setup(layout = layoutFixture()) {
  const onLayoutChange = mock((_layout: GridLayout, _detail: GridChangeDetail) => {})
  const onItemClick = mock((_id: string) => {})
  const controller = createGridController({
    defaultLayout: layout,
    responsive: false,
    onLayoutChange,
  })
  const dom = mount(layout)
  controller.gesture.setElement(dom.canvas)
  const gesture = createPointerGesture(controller, { onItemClick })
  const unbindPointer = gesture.bindPointer(dom.canvas)
  const unbindKeyboard = gesture.bindKeyboard(dom.canvas)
  const cleanup = () => {
    unbindPointer()
    unbindKeyboard()
    dom.canvas.remove()
  }
  return { controller, gesture, onLayoutChange, onItemClick, cleanup, ...dom }
}

describe('createPointerGesture', () => {
  it('moves an item past the drag threshold and commits on release', () => {
    const t = setup()
    const a = t.items.get('a')!
    pointer('pointerdown', a, 10, 10)
    pointer('pointermove', t.canvas, 12, 10)
    expect(t.controller.store.getSnapshot().interaction).toBeNull()
    pointer('pointermove', t.canvas, 510, 10)
    const state = t.controller.store.getSnapshot()
    expect(state.interaction?.mode).toBe('move')
    expect(state.activeRect?.x).toBe(500)
    expect(state.preview?.item.x).toBe(500)
    expect(document.documentElement.hasAttribute('data-gridla-dragging')).toBe(true)
    pointer('pointerup', t.canvas, 510, 10)
    expect(document.documentElement.hasAttribute('data-gridla-dragging')).toBe(false)
    expect(t.onLayoutChange).toHaveBeenCalledTimes(1)
    const [next, detail] = t.onLayoutChange.mock.calls[0]!
    expect(next.items.find((item) => item.id === 'a')?.x).toBe(500)
    expect(next.items.find((item) => item.id === 'b')?.x).toBe(0)
    expect(detail).toMatchObject({ reason: 'move', itemId: 'a', strategy: 'push-x' })
    expect(t.onItemClick).not.toHaveBeenCalled()
    t.cleanup()
  })

  it('treats a press without movement as a click and selects the item', () => {
    const t = setup()
    pointer('pointerdown', t.items.get('b')!, 600, 10)
    pointer('pointerup', t.canvas, 600, 10)
    expect(t.onLayoutChange).not.toHaveBeenCalled()
    expect(t.onItemClick).toHaveBeenCalledWith('b')
    expect(t.controller.store.getSnapshot().selectedId).toBe('b')
    t.cleanup()
  })

  it('ignores secondary mouse buttons and disabled gestures', () => {
    const t = setup()
    pointer('pointerdown', t.items.get('a')!, 10, 10, { button: 2, pointerType: 'mouse' })
    pointer('pointermove', t.canvas, 300, 10, { button: 2, pointerType: 'mouse' })
    expect(t.controller.store.getSnapshot().interaction).toBeNull()
    t.gesture.setOptions({ enabled: false })
    pointer('pointerdown', t.items.get('a')!, 10, 10)
    pointer('pointermove', t.canvas, 300, 10)
    expect(t.controller.store.getSnapshot().interaction).toBeNull()
    t.cleanup()
  })

  it('resizes with a handle and snaps the edge to a sibling', () => {
    const t = setup()
    pointer('pointerdown', t.handles.get('a:s')!, 250, 300)
    expect(t.controller.store.getSnapshot().interaction).toMatchObject({
      mode: 'resize',
      edge: 's',
    })
    pointer('pointermove', t.canvas, 250, 260)
    pointer('pointerup', t.canvas, 250, 260)
    const [next, detail] = t.onLayoutChange.mock.calls[0]!
    expect(next.items.find((item) => item.id === 'a')?.h).toBe(260)
    expect(detail.reason).toBe('resize')
    t.cleanup()
  })

  it('locks the axis with Shift and bypasses snapping with Ctrl', () => {
    const layout = layoutFixture()
    layout.items = [
      createItem('a', { w: 100, h: 100 }, 0, 0),
      createItem('b', { w: 100, h: 100 }, 500, 0),
    ]
    const t = setup(layout)
    const a = t.items.get('a')!
    pointer('pointerdown', a, 10, 10)
    pointer('pointermove', t.canvas, 100, 10)
    // Shift: the dominant axis so far is x, so y stays anchored where Shift was pressed.
    pointer('pointermove', t.canvas, 100, 10, { shiftKey: true })
    pointer('pointermove', t.canvas, 200, 80, { shiftKey: true })
    expect(t.controller.store.getSnapshot().activeRect).toMatchObject({ x: 190, y: 0 })
    // Releasing Shift follows the pointer again.
    pointer('pointermove', t.canvas, 200, 80)
    expect(t.controller.store.getSnapshot().activeRect).toMatchObject({ x: 190, y: 70 })
    // Ctrl: no alignment snapping, so a near-edge drop keeps its exact position
    // instead of aligning its right edge to b.
    pointer('pointermove', t.canvas, 407, 10, { ctrlKey: true })
    expect(t.controller.store.getSnapshot().preview?.item.x).toBe(397)
    pointer('pointermove', t.canvas, 407, 10)
    expect(t.controller.store.getSnapshot().preview?.item.x).toBe(400)
    pointer('pointercancel', t.canvas, 407, 10)
    expect(t.onLayoutChange).not.toHaveBeenCalled()
    t.cleanup()
  })

  it('cancels with Escape and nudges the selected item with arrow keys', () => {
    const layout = layoutFixture()
    layout.items = [
      createItem('a', { w: 100, h: 100 }, 0, 0),
      createItem('b', { w: 100, h: 100 }, 500, 0),
      createItem('c', { w: 100, h: 100 }, 0, 500),
    ]
    const t = setup(layout)
    const a = t.items.get('a')!
    pointer('pointerdown', a, 10, 10)
    pointer('pointermove', t.canvas, 300, 10)
    key(t.canvas, 'Escape')
    expect(t.controller.store.getSnapshot().interaction).toBeNull()
    expect(t.onLayoutChange).not.toHaveBeenCalled()

    pointer('pointerdown', a, 10, 10)
    pointer('pointerup', t.canvas, 10, 10)
    key(t.canvas, 'ArrowRight')
    expect(t.onLayoutChange.mock.calls.at(-1)?.[0].items[0].x).toBe(8)
    key(t.canvas, 'ArrowDown', { shiftKey: true })
    expect(t.onLayoutChange.mock.calls.at(-1)?.[0].items[0].y).toBe(32)
    key(t.canvas, 'ArrowRight', { altKey: true })
    expect(t.onLayoutChange.mock.calls.at(-1)?.[0].items[0].w).toBe(108)
    t.cleanup()
  })

  it('calls onDeleteKey for Delete and stops listening after unbind', () => {
    const t = setup()
    const onDeleteKey = mock((_id: string) => {})
    t.gesture.setOptions({ onDeleteKey })
    t.controller.actions.select('c')
    key(t.canvas, 'Delete')
    expect(onDeleteKey).toHaveBeenCalledWith('c')
    t.cleanup()
    pointer('pointerdown', t.items.get('a')!, 10, 10)
    pointer('pointermove', t.canvas, 300, 10)
    expect(t.controller.store.getSnapshot().interaction).toBeNull()
  })
})
