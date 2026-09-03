import { afterEach, describe, expect, it, mock } from 'bun:test'
import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { createItem, type GridLayout } from 'gridla'
import {
  GridCanvas,
  GridItem,
  GridPreviewOutline,
  GridProvider,
  GridTransferScope,
} from 'gridla/react'

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

function pointer(
  type: string,
  target: Element,
  x: number,
  y: number,
  extra: Record<string, unknown> = {},
) {
  fireEvent(
    target,
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

afterEach(() => cleanup())

function Canvas(props: { onLayoutChange?: (layout: GridLayout) => void; layout?: GridLayout }) {
  return (
    <GridProvider
      defaultLayout={props.layout ?? layoutFixture()}
      responsive={false}
      onLayoutChange={props.onLayoutChange}
    >
      <GridCanvas data-testid="canvas">
        {['a', 'b', 'c'].map((id) => (
          <GridItem key={id} id={id} data-testid={`item-${id}`} resizeEdges={['e', 's', 'se']} />
        ))}
        <GridPreviewOutline data-testid="preview" />
      </GridCanvas>
    </GridProvider>
  )
}

describe('pointer interaction', () => {
  it('moves an item with a drag and commits on release', () => {
    const onLayoutChange = mock((_layout: GridLayout) => {})
    const { getByTestId, queryByTestId } = render(<Canvas onLayoutChange={onLayoutChange} />)
    const canvas = getByTestId('canvas')
    mockRect(canvas, { x: 0, y: 0, w: 1000, h: 600 })
    const a = getByTestId('item-a')

    act(() => pointer('pointerdown', a, 10, 10))
    act(() => pointer('pointermove', canvas, 12, 10))
    expect(queryByTestId('preview')).toBeNull()
    act(() => pointer('pointermove', canvas, 510, 10))
    expect(a.getAttribute('data-gridla-active')).toBe('')
    expect(a.style.transform).toBe('translate(500px, 0px)')
    expect(getByTestId('preview').style.transform).toBe('translate(500px, 0px)')
    expect(getByTestId('item-b').getAttribute('data-gridla-shifted')).toBe('')
    act(() => pointer('pointerup', canvas, 510, 10))

    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    const next = onLayoutChange.mock.calls[0]?.[0]
    expect(next?.items.find((item) => item.id === 'a')?.x).toBe(500)
    expect(next?.items.find((item) => item.id === 'b')?.x).toBe(0)
    expect(a.getAttribute('data-gridla-active')).toBeNull()
  })

  it('treats a press without movement as a click', () => {
    const onLayoutChange = mock(() => {})
    const { getByTestId } = render(<Canvas onLayoutChange={onLayoutChange} />)
    const canvas = getByTestId('canvas')
    mockRect(canvas, { x: 0, y: 0, w: 1000, h: 600 })
    const b = getByTestId('item-b')
    act(() => pointer('pointerdown', b, 600, 10))
    act(() => pointer('pointerup', canvas, 600, 10))
    expect(onLayoutChange).not.toHaveBeenCalled()
    expect(b.getAttribute('data-gridla-selected')).toBe('')
  })

  it('resizes with a handle and snaps the edge to a sibling', () => {
    const onLayoutChange = mock((_layout: GridLayout) => {})
    const { getByTestId } = render(<Canvas onLayoutChange={onLayoutChange} />)
    const canvas = getByTestId('canvas')
    mockRect(canvas, { x: 0, y: 0, w: 1000, h: 600 })
    const handle = getByTestId('item-a').querySelector('[data-gridla-edge="s"]') as Element
    act(() => pointer('pointerdown', handle, 250, 300))
    act(() => pointer('pointermove', canvas, 250, 260))
    act(() => pointer('pointerup', canvas, 250, 260))
    const next = onLayoutChange.mock.calls[0]?.[0]
    expect(next?.items.find((item) => item.id === 'a')?.h).toBe(260)
  })

  it('cancels with Escape and pointercancel', () => {
    const onLayoutChange = mock(() => {})
    const { getByTestId } = render(<Canvas onLayoutChange={onLayoutChange} />)
    const canvas = getByTestId('canvas')
    mockRect(canvas, { x: 0, y: 0, w: 1000, h: 600 })
    const a = getByTestId('item-a')
    act(() => pointer('pointerdown', a, 10, 10))
    act(() => pointer('pointermove', canvas, 300, 10))
    act(() => {
      fireEvent.keyDown(canvas, { key: 'Escape' })
    })
    expect(a.getAttribute('data-gridla-active')).toBeNull()
    act(() => pointer('pointerdown', a, 10, 10))
    act(() => pointer('pointermove', canvas, 300, 10))
    act(() => pointer('pointercancel', canvas, 300, 10))
    expect(onLayoutChange).not.toHaveBeenCalled()
  })

  it('nudges the selected item with arrow keys', () => {
    const onLayoutChange = mock((_layout: GridLayout) => {})
    const layout = layoutFixture()
    layout.items = [
      createItem('a', { w: 100, h: 100 }, 0, 0),
      createItem('b', { w: 100, h: 100 }, 500, 0),
      createItem('c', { w: 100, h: 100 }, 0, 500),
    ]
    const { getByTestId } = render(<Canvas onLayoutChange={onLayoutChange} layout={layout} />)
    const canvas = getByTestId('canvas')
    mockRect(canvas, { x: 0, y: 0, w: 1000, h: 600 })
    act(() => pointer('pointerdown', getByTestId('item-a'), 10, 10))
    act(() => pointer('pointerup', canvas, 10, 10))
    act(() => {
      fireEvent.keyDown(canvas, { key: 'ArrowRight' })
    })
    expect(onLayoutChange.mock.calls.at(-1)?.[0].items[0].x).toBe(8)
    act(() => {
      fireEvent.keyDown(canvas, { key: 'ArrowDown', shiftKey: true })
    })
    expect(onLayoutChange.mock.calls.at(-1)?.[0].items[0].y).toBe(32)
    act(() => {
      fireEvent.keyDown(canvas, { key: 'ArrowRight', altKey: true })
    })
    expect(onLayoutChange.mock.calls.at(-1)?.[0].items[0].w).toBe(108)
  })
})

describe('transfer scope', () => {
  it('moves an item from one canvas to another', () => {
    const left = mock((_layout: GridLayout) => {})
    const right = mock((_layout: GridLayout) => {})
    const transferOut = mock(() => {})
    const transferIn = mock(() => {})
    const { getByTestId } = render(
      <GridTransferScope>
        <GridProvider
          defaultLayout={{
            canvas: { width: 400, height: 400, padding, heightMode: 'bounded' },
            items: [createItem('a', { w: 100, h: 100 }, 0, 0)],
          }}
          responsive={false}
          onLayoutChange={left}
          onTransferOut={transferOut}
        >
          <GridCanvas data-testid="left">
            <GridItem id="a" data-testid="left-a" />
          </GridCanvas>
        </GridProvider>
        <GridProvider
          defaultLayout={{
            canvas: { width: 400, height: 400, padding, heightMode: 'bounded' },
            items: [],
          }}
          responsive={false}
          onLayoutChange={right}
          onTransferIn={transferIn}
        >
          <GridCanvas data-testid="right" />
        </GridProvider>
      </GridTransferScope>,
    )
    const leftCanvas = getByTestId('left')
    const rightCanvas = getByTestId('right')
    mockRect(leftCanvas, { x: 0, y: 0, w: 400, h: 400 })
    mockRect(rightCanvas, { x: 500, y: 0, w: 400, h: 400 })
    const a = getByTestId('left-a')
    act(() => pointer('pointerdown', a, 50, 50))
    act(() => pointer('pointermove', leftCanvas, 200, 50))
    act(() => pointer('pointermove', leftCanvas, 700, 200))
    expect(a.getAttribute('data-gridla-transferring')).toBe('')
    act(() => pointer('pointerup', leftCanvas, 700, 200))

    expect(left.mock.calls.at(-1)?.[0].items).toHaveLength(0)
    const arrived = right.mock.calls.at(-1)?.[0].items
    expect(arrived).toHaveLength(1)
    expect(arrived?.[0]).toMatchObject({ id: 'a', x: 150, y: 150, w: 100, h: 100 })
    expect(transferOut).toHaveBeenCalledTimes(1)
    expect(transferIn).toHaveBeenCalledTimes(1)
  })

  it('drops the source preview while the target previews the item', () => {
    const { getByTestId, container } = render(
      <GridTransferScope>
        <GridProvider
          defaultLayout={{
            canvas: { width: 400, height: 400, padding, heightMode: 'bounded' },
            items: [
              createItem('a', { w: 100, h: 100 }, 0, 0),
              createItem('b', { w: 100, h: 100 }, 150, 0),
            ],
          }}
          responsive={false}
        >
          <GridCanvas data-testid="left">
            <GridItem id="a" data-testid="left-a" />
            <GridItem id="b" data-testid="left-b" />
            <GridPreviewOutline data-testid="left-outline" />
          </GridCanvas>
        </GridProvider>
        <GridProvider
          defaultLayout={{
            canvas: { width: 400, height: 400, padding, heightMode: 'bounded' },
            items: [],
          }}
          responsive={false}
        >
          <GridCanvas data-testid="right">
            <GridPreviewOutline data-testid="right-outline" />
          </GridCanvas>
        </GridProvider>
      </GridTransferScope>,
    )
    const leftCanvas = getByTestId('left')
    const rightCanvas = getByTestId('right')
    mockRect(leftCanvas, { x: 0, y: 0, w: 400, h: 400 })
    mockRect(rightCanvas, { x: 500, y: 0, w: 400, h: 400 })
    const a = getByTestId('left-a')
    const b = getByTestId('left-b')
    const restingB = b.getAttribute('style')

    // Dragging over b inside the source pushes it and shows the source outline.
    act(() => pointer('pointerdown', a, 50, 50))
    act(() => pointer('pointermove', leftCanvas, 200, 50))
    expect(container.querySelector('[data-testid="left-outline"]')).not.toBeNull()
    expect(b.getAttribute('style')).not.toBe(restingB)

    // Once the pointer previews in the target, the source shows its base layout.
    act(() => pointer('pointermove', leftCanvas, 700, 200))
    expect(a.getAttribute('data-gridla-transferring')).toBe('')
    expect(container.querySelector('[data-testid="left-outline"]')).toBeNull()
    expect(container.querySelector('[data-testid="right-outline"]')).not.toBeNull()
    expect(b.getAttribute('style')).toBe(restingB)
    expect(b.hasAttribute('data-gridla-shifted')).toBe(false)

    // Coming back restores the source preview within the same move.
    act(() => pointer('pointermove', leftCanvas, 200, 50))
    expect(a.hasAttribute('data-gridla-transferring')).toBe(false)
    expect(container.querySelector('[data-testid="right-outline"]')).toBeNull()
    expect(container.querySelector('[data-testid="left-outline"]')).not.toBeNull()
    act(() => pointer('pointerup', leftCanvas, 200, 50))
  })

  it('keeps the outer target when its preview pushes the source canvas under the pointer', () => {
    // Root: a group item hosting its own canvas, then free space below it.
    const { getByTestId, container } = render(
      <GridTransferScope>
        <GridProvider
          defaultLayout={{
            canvas: { width: 400, height: 600, padding, heightMode: 'bounded' },
            items: [createItem('group', { w: 400, h: 200 }, 0, 0)],
          }}
          responsive={false}
        >
          <GridCanvas data-testid="root">
            <GridItem id="group" data-testid="group" draggable={false}>
              <GridProvider
                defaultLayout={{
                  canvas: { width: 400, height: 200, padding, heightMode: 'bounded' },
                  items: [createItem('a', { w: 100, h: 100 }, 0, 0)],
                }}
                responsive={false}
              >
                <GridCanvas data-testid="inner">
                  <GridItem id="a" data-testid="inner-a" />
                </GridCanvas>
              </GridProvider>
            </GridItem>
            <GridPreviewOutline data-testid="root-outline" />
          </GridCanvas>
        </GridProvider>
      </GridTransferScope>,
    )
    const root = getByTestId('root')
    const group = getByTestId('group')
    const inner = getByTestId('inner')
    mockRect(root, { x: 0, y: 0, w: 400, h: 600 })
    // The group and its canvas slide towards the root preview's pushed
    // position; freeze them half-way, as a transition would.
    const slidY = () => {
      const match = /translate\([^,]+,\s*(-?[\d.]+)px/.exec(group.style.transform ?? '')
      return match ? Number(match[1]) / 2 : 0
    }
    const slidingRect = (base: { x: number; y: number; w: number; h: number }) => ({
      configurable: true,
      value: () => {
        const y = base.y + slidY()
        return {
          x: base.x,
          y,
          left: base.x,
          top: y,
          right: base.x + base.w,
          bottom: y + base.h,
          width: base.w,
          height: base.h,
          toJSON: () => ({}),
        }
      },
    })
    Object.defineProperty(
      group,
      'getBoundingClientRect',
      slidingRect({ x: 0, y: 0, w: 400, h: 200 }),
    )
    Object.defineProperty(
      inner,
      'getBoundingClientRect',
      slidingRect({ x: 0, y: 0, w: 400, h: 200 }),
    )
    const a = getByTestId('inner-a')
    act(() => pointer('pointerdown', a, 50, 50))
    // Just below the group: root space. The root preview places the item at the
    // pointer and pushes the group down, so the inner canvas now covers y=220.
    act(() => pointer('pointermove', inner, 50, 220))
    expect(container.querySelector('[data-testid="root-outline"]')).not.toBeNull()
    expect(slidY()).toBeGreaterThan(20)
    // The sliding source canvas now covers the pointer; further moves at the
    // same spot must not hand the pointer back to it.
    act(() => pointer('pointermove', inner, 51, 221))
    expect(container.querySelector('[data-testid="root-outline"]')).not.toBeNull()
    expect(slidY()).toBeGreaterThan(20)
    act(() => pointer('pointermove', inner, 50, 220))
    expect(container.querySelector('[data-testid="root-outline"]')).not.toBeNull()
    expect(a.getAttribute('data-gridla-transferring')).toBe('')
    act(() => pointer('pointerup', inner, 50, 220))
    expect(root.querySelectorAll('[data-gridla-item]').length).toBe(2)
  })
})
