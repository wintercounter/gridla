import { describe, expect, it, mock } from 'bun:test'

import { createItem, type GridLayout } from 'gridla'
import {
  createGridController,
  createTransferScope,
  observeSize,
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

function itemOf(layout: GridLayout, id: string) {
  return layout.items.find((item) => item.id === id)
}

describe('createGridController (uncontrolled)', () => {
  it('commits a pointer move with the solver strategy in onLayoutChange and onCommit', () => {
    const onLayoutChange = mock((_layout: GridLayout, _detail: GridChangeDetail) => {})
    const onCommit = mock((_detail: GridChangeDetail) => {})
    const controller = createGridController({
      defaultLayout: layoutFixture(),
      responsive: false,
      onLayoutChange,
      onCommit,
    })
    expect(controller.gesture.beginMove('a', { x: 10, y: 10 }, 1)).toBe(true)
    controller.gesture.updateMove({ x: 510, y: 10 }, { snap: true })
    const state = controller.store.getSnapshot()
    expect(state.interaction?.itemId).toBe('a')
    expect(state.activeRect).toEqual({ x: 500, y: 0, w: 500, h: 300 })
    expect(state.preview?.accepted).toBe(true)
    expect(itemOf(state.preview!.layout, 'b')?.x).toBe(0)

    controller.gesture.commit()
    expect(controller.store.getSnapshot().interaction).toBeNull()
    expect(controller.store.getSnapshot().preview).toBeNull()
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    const [next, detail] = onLayoutChange.mock.calls[0]!
    expect(itemOf(next, 'a')?.x).toBe(500)
    expect(itemOf(next, 'b')?.x).toBe(0)
    expect(detail).toEqual({ reason: 'move', itemId: 'a', strategy: 'push-x' })
    expect(onCommit).toHaveBeenCalledWith(detail)
    expect(itemOf(controller.store.getSnapshot().layout, 'a')?.x).toBe(500)
  })

  it('applies actions and reports each reason', () => {
    const onLayoutChange = mock((_layout: GridLayout, _detail: GridChangeDetail) => {})
    const controller = createGridController({
      defaultLayout: layoutFixture(),
      responsive: false,
      onLayoutChange,
    })
    expect(controller.actions.move('a', { x: 500, y: 0 })).toBe(true)
    expect(controller.actions.resize('c', { edge: 'n', delta: { x: 0, y: 50 } })).toBe(true)
    expect(
      controller.actions.place({ id: 'd', w: 200, h: 40 }, { position: { x: 0, y: 300 } }),
    ).toBe(true)
    controller.actions.update('d', { minW: 100 })
    controller.actions.remove('d')
    expect(onLayoutChange.mock.calls.map((call) => call[1].reason)).toEqual([
      'move',
      'resize',
      'place',
      'update',
      'remove',
    ])
    expect(controller.store.getSnapshot().layout.items).toHaveLength(3)
  })

  it('resizes through the gesture api and snaps to a sibling edge', () => {
    const onLayoutChange = mock((_layout: GridLayout, _detail: GridChangeDetail) => {})
    const controller = createGridController({
      defaultLayout: layoutFixture(),
      responsive: false,
      onLayoutChange,
    })
    expect(controller.gesture.beginResize('a', 's', { x: 250, y: 300 }, 1)).toBe(true)
    controller.gesture.updateResize({ x: 250, y: 260 }, { snap: true })
    expect(controller.store.getSnapshot().activeRect).toEqual({ x: 0, y: 0, w: 500, h: 260 })
    controller.gesture.commit()
    const [next, detail] = onLayoutChange.mock.calls[0]!
    expect(itemOf(next, 'a')?.h).toBe(260)
    expect(detail.reason).toBe('resize')
    expect(typeof detail.strategy).toBe('string')
  })

  it('cancels without reporting', () => {
    const onLayoutChange = mock(() => {})
    const controller = createGridController({
      defaultLayout: layoutFixture(),
      responsive: false,
      onLayoutChange,
    })
    controller.gesture.beginMove('a', { x: 10, y: 10 }, 1)
    controller.gesture.updateMove({ x: 300, y: 10 }, { snap: true })
    controller.gesture.cancel()
    expect(controller.store.getSnapshot().interaction).toBeNull()
    expect(onLayoutChange).not.toHaveBeenCalled()
  })

  it('projects the layout onto the measured size', () => {
    const controller = createGridController({ defaultLayout: layoutFixture() })
    expect(controller.store.getSnapshot().size).toBeNull()
    controller.setSize({ w: 500, h: 300 })
    const { layout, size } = controller.store.getSnapshot()
    expect(size).toEqual({ w: 500, h: 300 })
    expect(layout.canvas.width).toBe(500)
    expect(itemOf(layout, 'b')?.x).toBe(250)
    const before = controller.store.getSnapshot().layout
    controller.setSize({ w: 500, h: 300 })
    expect(controller.store.getSnapshot().layout).toBe(before)
  })

  it('tracks selection and previews incoming items', () => {
    const onSelectedIdChange = mock(() => {})
    const controller = createGridController({
      defaultLayout: layoutFixture(),
      responsive: false,
      onSelectedIdChange,
    })
    controller.actions.select('b')
    expect(controller.store.getSnapshot().selectedId).toBe('b')
    expect(onSelectedIdChange).toHaveBeenCalledWith('b')

    const preview = controller.actions.previewIncoming(createItem('d', { w: 100, h: 100 }, 0, 0), {
      x: 50,
      y: 50,
    })
    expect(preview?.accepted).toBe(true)
    expect(controller.store.getSnapshot().preview).toBe(preview)
    controller.actions.clearIncoming()
    expect(controller.store.getSnapshot().preview).toBeNull()
    expect(controller.actions.commitIncoming()).toBe(false)

    controller.actions.previewIncoming(createItem('d', { w: 100, h: 100 }, 0, 0), { x: 50, y: 50 })
    expect(controller.actions.commitIncoming()).toBe(true)
    expect(itemOf(controller.store.getSnapshot().layout, 'd')).toBeDefined()
  })
})

describe('createGridController (controlled)', () => {
  it('reports changes without mutating state and follows setOptions({ layout })', () => {
    const fixed = layoutFixture()
    const onLayoutChange = mock((_layout: GridLayout, _detail: GridChangeDetail) => {})
    const controller = createGridController({ layout: fixed, responsive: false, onLayoutChange })
    expect(controller.actions.move('a', { x: 500, y: 0 })).toBe(true)
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    // Not adopted: the store still shows the controlled layout.
    expect(itemOf(controller.store.getSnapshot().layout, 'a')?.x).toBe(0)
    expect(controller.store.getSnapshot().source).toBe(fixed)

    // Adopted: the parent forwards the next layout.
    const next = onLayoutChange.mock.calls[0]![0]
    controller.setOptions({ layout: next, responsive: false, onLayoutChange })
    expect(controller.store.getSnapshot().source).toBe(next)
    expect(itemOf(controller.store.getSnapshot().layout, 'a')?.x).toBe(500)

    // Same reference again is a no-op.
    const rendered = controller.store.getSnapshot().layout
    controller.setLayout(next)
    expect(controller.store.getSnapshot().layout).toBe(rendered)
  })

  it('re-renders when the config changes and syncs controlled selection', () => {
    const controller = createGridController({
      layout: layoutFixture(),
      responsive: false,
      selectedId: 'a',
    })
    expect(controller.store.getSnapshot().selectedId).toBe('a')
    const rendered = controller.store.getSnapshot().layout
    controller.setOptions({ layout: controller.store.getSnapshot().source, responsive: false })
    expect(controller.store.getSnapshot().layout).toBe(rendered)
    controller.setOptions({
      layout: controller.store.getSnapshot().source,
      responsive: false,
      gap: 8,
      selectedId: 'b',
    })
    expect(controller.getConfig().gap).toBe(8)
    expect(controller.store.getSnapshot().layout).not.toBe(rendered)
    expect(controller.store.getSnapshot().selectedId).toBe('b')
  })
})

describe('destroy', () => {
  it('unregisters from the transfer scope and drops the gesture', () => {
    const scope = createTransferScope()
    const source = createGridController({
      id: 'source',
      defaultLayout: layoutFixture(),
      responsive: false,
      scope,
    })
    const target = createGridController({
      id: 'target',
      defaultLayout: {
        canvas: { width: 400, height: 400, padding, heightMode: 'bounded' },
        items: [],
      },
      responsive: false,
      scope,
    })
    const targetElement = document.createElement('div')
    Object.defineProperty(targetElement, 'getBoundingClientRect', {
      value: () => ({ left: 2000, top: 0, right: 2400, bottom: 400, width: 400, height: 400 }),
    })
    target.gesture.setElement(targetElement)

    source.gesture.beginMove('a', { x: 10, y: 10 }, 1)
    scope.track('source', 'a', { x: 2100, y: 100 })
    expect(target.store.getSnapshot().preview).not.toBeNull()
    expect(source.store.getSnapshot().transferring).toBe(true)

    target.destroy()
    // The target is gone: its preview was cleared and the source is no longer transferring.
    expect(target.store.getSnapshot().preview).toBeNull()
    expect(source.store.getSnapshot().transferring).toBe(false)
    scope.track('source', 'a', { x: 2100, y: 100 })
    expect(target.store.getSnapshot().preview).toBeNull()

    source.destroy()
    expect(source.store.getSnapshot().interaction).toBeNull()
    expect(scope.drop('source')).toBe(false)
  })

  it('observeSize measures once, follows resizes, and stops after unsubscribe', () => {
    const element = document.createElement('div')
    let size = { width: 300, height: 200 }
    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({ ...size, left: 0, top: 0, right: size.width, bottom: size.height }),
    })
    const sizes: Array<{ w: number; h: number }> = []
    const stop = observeSize(element, (next) => sizes.push(next))
    expect(sizes).toEqual([{ w: 300, h: 200 }])
    size = { width: 0, height: 0 }
    stop()
    expect(sizes).toHaveLength(1)
  })
})
