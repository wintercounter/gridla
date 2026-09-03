import { describe, expect, it, mock } from 'bun:test'
import { act, render, renderHook } from '@testing-library/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { createItem, type GridLayout } from 'gridla'
import type { GridChangeDetail } from 'gridla/react'
import {
  GridProvider,
  useGridActions,
  useGridItemView,
  useGridLayout,
  useGridSelection,
  useGridStore,
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

function wrapperFor(props: Partial<Parameters<typeof GridProvider>[0]>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <GridProvider defaultLayout={layoutFixture()} responsive={false} {...props}>
        {children}
      </GridProvider>
    )
  }
}

describe('GridProvider (uncontrolled)', () => {
  it('exposes the layout and applies actions', () => {
    const onLayoutChange = mock((_layout: GridLayout, _detail: GridChangeDetail) => {})
    const { result } = renderHook(() => ({ layout: useGridLayout(), actions: useGridActions() }), {
      wrapper: wrapperFor({ onLayoutChange }),
    })
    expect(result.current.layout.items).toHaveLength(3)

    act(() => {
      expect(result.current.actions.move('a', { x: 500, y: 0 })).toBe(true)
    })
    const a = result.current.layout.items.find((item) => item.id === 'a')
    const b = result.current.layout.items.find((item) => item.id === 'b')
    expect(a?.x).toBe(500)
    expect(b?.x).toBe(0)
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    expect(onLayoutChange.mock.calls[0]?.[1]).toMatchObject({
      reason: 'move',
      itemId: 'a',
      strategy: 'push-x',
    })

    act(() => {
      expect(result.current.actions.resize('c', { edge: 'n', delta: { x: 0, y: 50 } })).toBe(true)
    })
    expect(result.current.layout.items.find((item) => item.id === 'c')).toMatchObject({
      y: 350,
      h: 250,
    })

    act(() => {
      expect(
        result.current.actions.place({ id: 'd', w: 200, h: 40 }, { position: { x: 0, y: 300 } }),
      ).toBe(true)
    })
    expect(result.current.layout.items).toHaveLength(4)

    act(() => {
      result.current.actions.update('d', { minW: 100, data: { label: 'new' } })
    })
    expect(result.current.layout.items.find((item) => item.id === 'd')).toMatchObject({
      minW: 100,
      data: { label: 'new' },
    })

    act(() => {
      result.current.actions.remove('d')
    })
    expect(result.current.layout.items).toHaveLength(3)
    expect(onLayoutChange).toHaveBeenCalledTimes(5)
  })

  it('reports rejected moves without changing the layout', () => {
    const { result } = renderHook(() => ({ layout: useGridLayout(), actions: useGridActions() }), {
      wrapper: wrapperFor({
        defaultLayout: {
          ...layoutFixture(),
          items: [
            createItem('wall', { w: 1000, h: 600, minW: 1000, minH: 600 }, 0, 0),
            { ...createItem('x', { w: 10, h: 10 }, 0, 0), policy: { movement: 'locked' } },
          ],
        },
      }),
    })
    const before = result.current.layout
    act(() => {
      expect(result.current.actions.move('x', { x: 500, y: 500 })).toBe(false)
    })
    expect(result.current.layout).toBe(before)
  })

  it('tracks selection', () => {
    const onSelectedIdChange = mock(() => {})
    const { result } = renderHook(
      () => ({ selected: useGridSelection(), actions: useGridActions() }),
      {
        wrapper: wrapperFor({ onSelectedIdChange }),
      },
    )
    expect(result.current.selected).toBeNull()
    act(() => result.current.actions.select('b'))
    expect(result.current.selected).toBe('b')
    expect(onSelectedIdChange).toHaveBeenCalledWith('b')
  })
})

describe('GridProvider (controlled)', () => {
  it('does not mutate internal state and calls back with the next layout', () => {
    function Harness() {
      const [layout, setLayout] = useState(layoutFixture)
      const calls = useRef(0)
      return (
        <GridProvider
          layout={layout}
          responsive={false}
          onLayoutChange={(next) => {
            calls.current += 1
            setLayout(next)
          }}
        >
          <Probe />
        </GridProvider>
      )
    }
    let probe: { layout: GridLayout; move: () => boolean } | null = null
    function Probe() {
      const layout = useGridLayout()
      const actions = useGridActions()
      probe = { layout, move: () => actions.move('a', { x: 500, y: 0 }) }
      return null
    }
    render(<Harness />)
    expect(probe!.layout.items[0].x).toBe(0)
    act(() => {
      probe!.move()
    })
    expect(probe!.layout.items.find((item) => item.id === 'a')?.x).toBe(500)
  })

  it('ignores commits when the parent does not adopt them', () => {
    const fixed = layoutFixture()
    const onLayoutChange = mock(() => {})
    const { result } = renderHook(() => ({ layout: useGridLayout(), actions: useGridActions() }), {
      wrapper: wrapperFor({ layout: fixed, onLayoutChange }),
    })
    act(() => {
      result.current.actions.move('a', { x: 500, y: 0 })
    })
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    expect(result.current.layout.items[0].x).toBe(0)
  })
})

describe('selector granularity', () => {
  it('rerenders only the items whose view changed', () => {
    const renders: Record<string, number> = { a: 0, b: 0, c: 0 }
    function Item({ id }: { id: string }) {
      const view = useGridItemView(id)
      useEffect(() => {
        renders[id] += 1
      })
      return <div data-testid={id}>{`${view.rect.x},${view.rect.y}`}</div>
    }
    let actions: ReturnType<typeof useGridActions> | null = null
    function Actions() {
      actions = useGridActions()
      return null
    }
    render(
      <GridProvider defaultLayout={layoutFixture()} responsive={false}>
        <Actions />
        <Item id="a" />
        <Item id="b" />
        <Item id="c" />
      </GridProvider>,
    )
    expect(renders).toEqual({ a: 1, b: 1, c: 1 })
    act(() => {
      actions!.select('a')
    })
    expect(renders).toEqual({ a: 2, b: 1, c: 1 })
    act(() => {
      actions!.resize('c', { edge: 's', delta: { x: 0, y: -50 } })
    })
    expect(renders).toEqual({ a: 2, b: 1, c: 2 })
  })

  it('supports custom equality in useGridStore', () => {
    let count = 0
    const { result } = renderHook(
      () => {
        count += 1
        return useGridStore(
          (state) => state.layout.items.map((item) => item.id),
          (a, b) => a.length === b.length && a.every((id, index) => id === b[index]),
        )
      },
      { wrapper: wrapperFor({}) },
    )
    const first = result.current
    expect(first).toEqual(['a', 'b', 'c'])
    expect(count).toBe(1)
  })
})
