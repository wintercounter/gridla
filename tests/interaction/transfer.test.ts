import { describe, expect, it, mock } from 'bun:test'

import { createItem, type GridLayout } from 'gridla'
import {
  createGridController,
  createPointerGesture,
  createTransferScope,
  measurePreviewShift,
  type GridController,
  type GridPreview,
} from 'gridla/interaction'

const padding = { top: 0, right: 0, bottom: 0, left: 0 }

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

function mockRect(element: Element, rect: Rect | (() => Rect)) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => rectOf(typeof rect === 'function' ? rect() : rect),
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

/** Build a canvas element for `controller`, with one drag surface per item, inside `parent`. */
function mountCanvas(controller: GridController, parent: HTMLElement) {
  const canvas = document.createElement('div')
  canvas.setAttribute('data-gridla-canvas', '')
  const items = new Map<string, HTMLElement>()
  for (const item of controller.store.getSnapshot().layout.items) {
    const element = document.createElement('div')
    element.setAttribute('data-gridla-item', item.id)
    element.setAttribute('data-gridla-drag-handle', item.id)
    canvas.appendChild(element)
    items.set(item.id, element)
  }
  parent.appendChild(canvas)
  controller.gesture.setElement(canvas)
  return { canvas, items }
}

describe('createTransferScope', () => {
  it('moves an item from one controller to another', () => {
    const scope = createTransferScope()
    const left = mock((_layout: GridLayout) => {})
    const right = mock((_layout: GridLayout) => {})
    const transferOut = mock((_itemId: string, _targetId: string) => {})
    const transferIn = mock(() => {})
    const source = createGridController({
      id: 'left',
      defaultLayout: {
        canvas: { width: 400, height: 400, padding, heightMode: 'bounded' },
        items: [createItem('a', { w: 100, h: 100 }, 0, 0)],
      },
      responsive: false,
      onLayoutChange: left,
      onTransferOut: transferOut,
      scope,
    })
    const target = createGridController({
      id: 'right',
      defaultLayout: {
        canvas: { width: 400, height: 400, padding, heightMode: 'bounded' },
        items: [],
      },
      responsive: false,
      onLayoutChange: right,
      onTransferIn: transferIn,
      scope,
    })
    const root = document.createElement('div')
    document.body.appendChild(root)
    const leftDom = mountCanvas(source, root)
    const rightDom = mountCanvas(target, root)
    mockRect(leftDom.canvas, { x: 0, y: 0, w: 400, h: 400 })
    mockRect(rightDom.canvas, { x: 500, y: 0, w: 400, h: 400 })
    const gesture = createPointerGesture(source, { scope })
    const unbind = gesture.bindPointer(leftDom.canvas)

    const a = leftDom.items.get('a')!
    pointer('pointerdown', a, 50, 50)
    pointer('pointermove', leftDom.canvas, 200, 50)
    expect(source.store.getSnapshot().preview).not.toBeNull()
    pointer('pointermove', leftDom.canvas, 700, 200)
    // The source shows its base layout while the target previews the item.
    expect(source.store.getSnapshot().transferring).toBe(true)
    expect(source.store.getSnapshot().preview).toBeNull()
    expect(target.store.getSnapshot().preview?.item).toMatchObject({ id: 'a', x: 150, y: 150 })

    // Coming back restores the source preview within the same move.
    pointer('pointermove', leftDom.canvas, 200, 50)
    expect(source.store.getSnapshot().transferring).toBe(false)
    expect(source.store.getSnapshot().preview).not.toBeNull()
    expect(target.store.getSnapshot().preview).toBeNull()

    pointer('pointermove', leftDom.canvas, 700, 200)
    pointer('pointerup', leftDom.canvas, 700, 200)
    expect(left.mock.calls.at(-1)?.[0].items).toHaveLength(0)
    const arrived = right.mock.calls.at(-1)?.[0].items
    expect(arrived).toHaveLength(1)
    expect(arrived?.[0]).toMatchObject({ id: 'a', x: 150, y: 150, w: 100, h: 100 })
    expect(transferOut).toHaveBeenCalledWith('a', 'right')
    expect(transferIn).toHaveBeenCalledTimes(1)
    expect(source.store.getSnapshot().interaction).toBeNull()

    unbind()
    root.remove()
    source.destroy()
    target.destroy()
  })

  it('keeps the outer target when its preview pushes the source canvas under the pointer', () => {
    const scope = createTransferScope()
    // Root: a group item hosting its own canvas, then free space below it.
    const rootController = createGridController({
      id: 'root',
      defaultLayout: {
        canvas: { width: 400, height: 600, padding, heightMode: 'bounded' },
        items: [createItem('group', { w: 400, h: 200 }, 0, 0)],
      },
      responsive: false,
      scope,
    })
    const innerController = createGridController({
      id: 'inner',
      defaultLayout: {
        canvas: { width: 400, height: 200, padding, heightMode: 'bounded' },
        items: [createItem('a', { w: 100, h: 100 }, 0, 0)],
      },
      responsive: false,
      scope,
    })
    const body = document.createElement('div')
    document.body.appendChild(body)
    const rootDom = mountCanvas(rootController, body)
    const group = rootDom.items.get('group')!
    group.removeAttribute('data-gridla-drag-handle')
    const innerDom = mountCanvas(innerController, group)
    mockRect(rootDom.canvas, { x: 0, y: 0, w: 400, h: 600 })
    // The group and its canvas slide towards the root preview's pushed
    // position; freeze them half-way, as a transition would.
    const slidY = () => {
      const state = rootController.store.getSnapshot()
      const shown = (state.preview?.layout ?? state.layout).items.find(
        (item) => item.id === 'group',
      )
      return shown ? shown.y / 2 : 0
    }
    mockRect(group, () => ({ x: 0, y: slidY(), w: 400, h: 200 }))
    mockRect(innerDom.canvas, () => ({ x: 0, y: slidY(), w: 400, h: 200 }))
    const gesture = createPointerGesture(innerController, { scope })
    const unbind = gesture.bindPointer(innerDom.canvas)

    const a = innerDom.items.get('a')!
    pointer('pointerdown', a, 50, 50)
    // Just below the group: root space. The root preview places the item at the
    // pointer and pushes the group down, so the inner canvas now covers y=220.
    pointer('pointermove', innerDom.canvas, 50, 220)
    expect(rootController.store.getSnapshot().preview).not.toBeNull()
    expect(slidY()).toBeGreaterThan(20)
    // The sliding source canvas now covers the pointer; further moves at the
    // same spot must not hand the pointer back to it.
    pointer('pointermove', innerDom.canvas, 51, 221)
    expect(rootController.store.getSnapshot().preview).not.toBeNull()
    expect(slidY()).toBeGreaterThan(20)
    pointer('pointermove', innerDom.canvas, 50, 220)
    expect(rootController.store.getSnapshot().preview).not.toBeNull()
    expect(innerController.store.getSnapshot().transferring).toBe(true)
    pointer('pointerup', innerDom.canvas, 50, 220)
    expect(rootController.store.getSnapshot().layout.items).toHaveLength(2)
    expect(innerController.store.getSnapshot().layout.items).toHaveLength(0)

    unbind()
    body.remove()
    rootController.destroy()
    innerController.destroy()
  })

  it('respects acceptTransfers and cancel', () => {
    const scope = createTransferScope()
    const source = createGridController({
      id: 'source',
      defaultLayout: {
        canvas: { width: 400, height: 400, padding, heightMode: 'bounded' },
        items: [createItem('a', { w: 100, h: 100 }, 0, 0)],
      },
      responsive: false,
      scope,
    })
    const accepts = mock((_item: unknown, _sourceId: string) => false)
    const target = createGridController({
      id: 'target',
      defaultLayout: {
        canvas: { width: 400, height: 400, padding, heightMode: 'bounded' },
        items: [],
      },
      responsive: false,
      acceptTransfers: accepts,
      scope,
    })
    const root = document.createElement('div')
    document.body.appendChild(root)
    const sourceDom = mountCanvas(source, root)
    const targetDom = mountCanvas(target, root)
    mockRect(sourceDom.canvas, { x: 0, y: 0, w: 400, h: 400 })
    mockRect(targetDom.canvas, { x: 500, y: 0, w: 400, h: 400 })

    source.gesture.beginMove('a', { x: 50, y: 50 }, 1)
    scope.track('source', 'a', { x: 700, y: 200 })
    expect(accepts).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 'source')
    expect(target.store.getSnapshot().preview).toBeNull()
    expect(scope.drop('source')).toBe(false)

    accepts.mockImplementation(() => true)
    source.gesture.beginMove('a', { x: 50, y: 50 }, 1)
    scope.track('source', 'a', { x: 700, y: 200 })
    expect(target.store.getSnapshot().preview).not.toBeNull()
    scope.cancel()
    expect(target.store.getSnapshot().preview).toBeNull()
    expect(source.store.getSnapshot().transferring).toBe(false)
    expect(scope.drop('source')).toBe(false)

    root.remove()
    source.destroy()
    target.destroy()
  })
})

describe('measurePreviewShift', () => {
  it('reports how far the target preview moved the host item of an element', () => {
    const canvas = document.createElement('div')
    canvas.setAttribute('data-gridla-canvas', '')
    const host = document.createElement('div')
    host.setAttribute('data-gridla-item', 'group')
    const inner = document.createElement('div')
    host.append(inner)
    canvas.append(host)
    document.body.append(canvas)
    const rect = (x: number, y: number, w: number, h: number) => ({
      x,
      y,
      left: x,
      top: y,
      right: x + w,
      bottom: y + h,
      width: w,
      height: h,
      toJSON: () => ({}),
    })
    Object.defineProperty(canvas, 'getBoundingClientRect', { value: () => rect(0, 0, 400, 600) })
    // The group rests at y=0 but is currently drawn at y=120 by a preview.
    Object.defineProperty(host, 'getBoundingClientRect', { value: () => rect(0, 120, 400, 200) })
    const layout = {
      canvas: {
        width: 400,
        height: 600,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        heightMode: 'bounded' as const,
      },
      items: [{ id: 'group', x: 0, y: 0, w: 400, h: 200, minW: 1, minH: 1 }],
    }
    const shifted = { ...layout, items: [{ ...layout.items[0], y: 120 }] }
    const preview: GridPreview = {
      layout: shifted,
      item: shifted.items[0],
      strategy: 'push-y',
      shiftedSiblings: false,
      accepted: true,
    }
    expect(measurePreviewShift(canvas, { layout, preview }, inner)).toEqual({ x: 0, y: 120 })
    expect(measurePreviewShift(canvas, { layout, preview: null }, inner)).toEqual({ x: 0, y: 0 })
    expect(measurePreviewShift(canvas, { layout, preview }, document.body)).toEqual({ x: 0, y: 0 })
    canvas.remove()
  })
})
