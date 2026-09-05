import { describe, expect, it, mock } from 'bun:test'

import { createItem, type GridLayout } from 'gridla'
import { createTransferScope, mountGrid, type GridChangeDetail } from 'gridla/dom'

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

function canvasElement(rect = { x: 0, y: 0, w: 1000, h: 600 }) {
  const element = document.createElement('div')
  mockRect(element, rect)
  document.body.appendChild(element)
  return element
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

function key(target: Element, name: string, extra: Record<string, unknown> = {}) {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: name, ...extra }))
}

const item = (root: Element, id: string) =>
  root.querySelector<HTMLElement>(`[data-gridla-item="${id}"]`)

describe('mountGrid', () => {
  it('mounts one element per item with the contract attributes and geometry', () => {
    const element = canvasElement()
    const handle = mountGrid(element, {
      defaultLayout: layoutFixture(),
      responsive: false,
      resizeEdges: ['e', 'se'],
    })
    expect(element.hasAttribute('data-gridla-canvas')).toBe(true)
    expect(element.tabIndex).toBe(0)
    expect(element.style.position).toBe('relative')
    expect(element.style.width).toBe('1000px')
    const items = element.querySelectorAll('[data-gridla-item]')
    expect(items).toHaveLength(3)
    const b = item(element, 'b')!
    expect(b.getAttribute('data-gridla-drag-handle')).toBe('b')
    expect(b.textContent).toBe('b')
    expect(b.style.transform).toBe('translate(500px, 0px)')
    expect(b.style.width).toBe('500px')
    expect(b.style.height).toBe('300px')
    expect(b.querySelectorAll('[data-gridla-resize-handle="b"]')).toHaveLength(2)
    expect(b.querySelector('[data-gridla-resize-handle="b"][data-gridla-edge="se"]')).not.toBeNull()
    handle.destroy()
    element.remove()
  })

  it('calls renderItem on mount and again when the view changes, keeping handles attached', () => {
    const element = canvasElement()
    const renderItem = mock((entry: { id: string }, node: HTMLElement) => {
      node.innerHTML = `<span>${entry.id}</span>`
    })
    const handle = mountGrid(element, {
      defaultLayout: layoutFixture(),
      responsive: false,
      resizeEdges: ['se'],
      renderItem,
    })
    expect(renderItem).toHaveBeenCalledTimes(3)
    const a = item(element, 'a')!
    expect(a.querySelector('span')?.textContent).toBe('a')
    expect(a.querySelector('[data-gridla-resize-handle]')).not.toBeNull()

    handle.select('a')
    expect(a.hasAttribute('data-gridla-selected')).toBe(true)
    expect(renderItem).toHaveBeenCalledTimes(4)
    const [, , view] = renderItem.mock.calls[3]! as unknown as [
      unknown,
      unknown,
      { isSelected: boolean },
    ]
    expect(view.isSelected).toBe(true)
    // The renderer replaced the content again; the handle survived.
    expect(a.querySelector('[data-gridla-resize-handle]')).not.toBeNull()
    handle.destroy()
    element.remove()
  })

  it('positions with left/top when positioning is absolute', () => {
    const element = canvasElement()
    const handle = mountGrid(element, {
      defaultLayout: layoutFixture(),
      responsive: false,
      positioning: 'absolute',
    })
    const b = item(element, 'b')!
    expect(b.style.left).toBe('500px')
    expect(b.style.transform).toBe('')
    handle.destroy()
    element.remove()
  })

  it('reconciles item elements in place on setLayout (uncontrolled)', () => {
    const element = canvasElement()
    const handle = mountGrid(element, { defaultLayout: layoutFixture(), responsive: false })
    const a = item(element, 'a')!
    const next = layoutFixture()
    next.items = [
      { ...next.items[0]!, x: 100 },
      createItem('d', { w: 200, h: 100, minW: 40, minH: 40 }, 700, 0, { label: 'D' }),
    ]
    handle.setLayout(next)
    expect(item(element, 'a')).toBe(a)
    expect(a.style.transform).toBe('translate(100px, 0px)')
    expect(item(element, 'b')).toBeNull()
    expect(item(element, 'c')).toBeNull()
    expect(item(element, 'd')).not.toBeNull()
    expect(handle.getLayout()).toBe(next)
    handle.destroy()
    element.remove()
  })

  it('applies changes immediately in controlled mode and lets the owner override', () => {
    const element = canvasElement()
    const layout = layoutFixture()
    const onLayoutChange = mock(
      (_layout: GridLayout<{ label: string }>, _d: GridChangeDetail) => {},
    )
    const handle = mountGrid(element, { layout, responsive: false, onLayoutChange })
    expect(handle.controller.actions.move('a', { x: 500, y: 0 })).toBe(true)
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    // Rendered right away, so a second event in the same tick sees the new layout.
    expect(item(element, 'a')!.style.transform).toBe('translate(500px, 0px)')
    const [next] = onLayoutChange.mock.calls[0]!
    handle.setLayout(next)
    expect(handle.getLayout()).toBe(next)
    // A later option change must not revert to the mount-time layout.
    handle.setOptions({ gap: 4 })
    expect(handle.getLayout()).toBe(next)
    // The owner can still reject the change by passing another layout.
    handle.setLayout(layout)
    expect(item(element, 'a')!.style.transform).toBe('translate(0px, 0px)')
    handle.destroy()
    element.remove()
  })

  it('drives a pointer move through the gesture and shows the preview outline', () => {
    const element = canvasElement()
    const onCommit = mock((_d: GridChangeDetail) => {})
    const handle = mountGrid(element, {
      defaultLayout: layoutFixture(),
      responsive: false,
      preview: true,
      onCommit,
    })
    const a = item(element, 'a')!
    pointer('pointerdown', a, 10, 10)
    pointer('pointermove', element, 510, 10)
    expect(a.hasAttribute('data-gridla-active')).toBe(true)
    expect(element.hasAttribute('data-gridla-active')).toBe(true)
    expect(a.style.zIndex).toBe('2')
    expect(a.style.transform).toBe('translate(500px, 0px)')
    expect(item(element, 'b')!.hasAttribute('data-gridla-shifted')).toBe(true)
    expect(document.documentElement.hasAttribute('data-gridla-dragging')).toBe(true)
    const preview = element.querySelector<HTMLElement>('[data-gridla-preview]')!
    expect(preview.style.display).toBe('')
    expect(preview.style.transform).toBe('translate(500px, 0px)')
    pointer('pointerup', element, 510, 10)
    expect(document.documentElement.hasAttribute('data-gridla-dragging')).toBe(false)
    expect(preview.style.display).toBe('none')
    expect(a.hasAttribute('data-gridla-active')).toBe(false)
    expect(onCommit).toHaveBeenCalledWith({ reason: 'move', itemId: 'a', strategy: 'push-x' })
    expect(handle.getLayout().items.find((entry) => entry.id === 'a')?.x).toBe(500)
    handle.destroy()
    element.remove()
  })

  it('nudges the selected item with the keyboard after a click', () => {
    const element = canvasElement()
    const layout = layoutFixture()
    // Leave 100 px of slack to the right of `a` so a nudge is accepted.
    layout.items[0] = { ...layout.items[0]!, w: 400 }
    const handle = mountGrid(element, { defaultLayout: layout, responsive: false })
    const a = item(element, 'a')!
    pointer('pointerdown', a, 10, 10)
    pointer('pointerup', element, 10, 10)
    expect(a.hasAttribute('data-gridla-selected')).toBe(true)
    key(element, 'ArrowRight')
    expect(handle.getLayout().items.find((entry) => entry.id === 'a')?.x).toBe(8)
    key(element, 'ArrowRight', { shiftKey: true })
    expect(handle.getLayout().items.find((entry) => entry.id === 'a')?.x).toBe(40)
    expect(a.style.transform).toBe('translate(40px, 0px)')
    handle.destroy()
    element.remove()
  })

  it('notifies subscribers and honors the selection API', () => {
    const element = canvasElement()
    const onSelectedIdChange = mock((_id: string | null) => {})
    const handle = mountGrid(element, {
      defaultLayout: layoutFixture(),
      responsive: false,
      onSelectedIdChange,
    })
    const listener = mock((_state: unknown) => {})
    const unsubscribe = handle.subscribe(listener)
    handle.select('c')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(onSelectedIdChange).toHaveBeenCalledWith('c')
    expect(item(element, 'c')!.hasAttribute('data-gridla-selected')).toBe(true)
    unsubscribe()
    handle.select(null)
    expect(listener).toHaveBeenCalledTimes(1)
    handle.destroy()
    element.remove()
  })

  it('destroy removes items, listeners, and the canvas attribute', () => {
    const element = canvasElement()
    const onLayoutChange = mock(() => {})
    const handle = mountGrid(element, {
      defaultLayout: layoutFixture(),
      responsive: false,
      preview: true,
      onLayoutChange,
    })
    handle.destroy()
    expect(element.querySelectorAll('[data-gridla-item]')).toHaveLength(0)
    expect(element.querySelector('[data-gridla-preview]')).toBeNull()
    expect(element.hasAttribute('data-gridla-canvas')).toBe(false)
    // Pointer input is no longer handled.
    pointer('pointerdown', element, 10, 10)
    pointer('pointermove', element, 510, 10)
    pointer('pointerup', element, 510, 10)
    expect(onLayoutChange).not.toHaveBeenCalled()
    expect(handle.controller.store.getSnapshot().interaction).toBeNull()
    element.remove()
  })

  it('transfers an item between an outer canvas and a nested mount sharing a scope', () => {
    const scope = createTransferScope()
    const outerElement = canvasElement({ x: 0, y: 0, w: 1000, h: 600 })
    const inner: GridLayout<{ label: string }> = {
      canvas: { width: 1000, height: 300, padding, heightMode: 'bounded' },
      items: [createItem('c1', { w: 400, h: 300, minW: 40, minH: 40 }, 0, 0, { label: 'C1' })],
    }
    const onTransferIn = mock((_item: unknown, _source: string) => {})
    const onTransferOut = mock((_id: string, _target: string) => {})
    let innerHandle: ReturnType<typeof mountGrid<{ label: string }>> | null = null
    const outer = mountGrid(outerElement, {
      defaultLayout: layoutFixture(),
      responsive: false,
      scope,
      onTransferOut,
      renderItem: (entry, node) => {
        if (entry.id !== 'c' || innerHandle) return
        const nested = document.createElement('div')
        // Item `c` sits at y=300 with height 300; the nested canvas fills it.
        mockRect(nested, { x: 0, y: 300, w: 1000, h: 300 })
        node.append(nested)
        innerHandle = mountGrid(nested, {
          defaultLayout: inner,
          responsive: false,
          scope,
          onTransferIn,
        })
      },
    })
    expect(innerHandle).not.toBeNull()
    const a = item(outerElement, 'a')!
    pointer('pointerdown', a, 10, 10)
    pointer('pointermove', outerElement, 20, 20)
    pointer('pointermove', outerElement, 700, 450)
    expect(a.hasAttribute('data-gridla-transferring')).toBe(true)
    pointer('pointerup', outerElement, 700, 450)
    expect(onTransferOut).toHaveBeenCalledWith('a', innerHandle!.controller.id)
    expect(onTransferIn).toHaveBeenCalledTimes(1)
    expect(outer.getLayout().items.map((entry) => entry.id)).toEqual(['b', 'c'])
    expect(innerHandle!.getLayout().items.map((entry) => entry.id)).toEqual(['c1', 'a'])
    expect(item(outerElement, 'a')).not.toBeNull()
    expect(item(outerElement, 'a')!.parentElement).toBe(innerHandle!.element)
    innerHandle!.destroy()
    outer.destroy()
    outerElement.remove()
  })
})
