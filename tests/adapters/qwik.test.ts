import './qwik-runtime'

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'

import { jsx, type JSXNode, type JSXOutput } from '@builder.io/qwik'
import { renderToString } from '@builder.io/qwik/server'

import { createItem, type GridLayout } from 'gridla'
import {
  GridCanvas,
  GridItem,
  GridPreviewOutline,
  GridProvider,
  GridTransferScope,
  selectItemView,
  type GridState,
} from 'gridla/qwik'

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

async function render(node: JSXNode) {
  const result = await renderToString(node, { containerTagName: 'div' })
  return result.html
}

// Without the optimizer and a client manifest Qwik reports symbols it cannot
// map to chunks. That is expected here; anything else is a real problem.
const EXPECTED_NOISE = /serializeQRL: Cannot resolve symbol|Missing client manifest/
const spies: ReturnType<typeof spyOn>[] = []
const unexpected: string[] = []
beforeEach(() => {
  for (const level of ['warn', 'error'] as const) {
    spies.push(
      spyOn(console, level).mockImplementation((...args: unknown[]) => {
        const message = args.map(String).join(' ')
        if (!EXPECTED_NOISE.test(message)) unexpected.push(message)
      }),
    )
  }
})
afterEach(() => {
  for (const spy of spies.splice(0)) spy.mockRestore()
  expect(unexpected.splice(0)).toEqual([])
})

const item = (id: string, props: Record<string, unknown>, children: JSXOutput) =>
  jsx(GridItem, { id, ...props, children })

describe('gridla/qwik server render', () => {
  it('emits the shared data attributes and positions items at their authored size', async () => {
    const html = await render(
      jsx(GridProvider, {
        defaultLayout: layoutFixture(),
        responsive: false,
        children: jsx(GridCanvas, {
          children: [
            item('a', { resizeEdges: ['e', 'se'] }, 'Item A'),
            item('b', { draggable: false }, 'Item B'),
            jsx(GridPreviewOutline, {}),
          ],
        }),
      }),
    )
    expect(html).toContain('data-gridla-canvas')
    expect(html).toContain('data-gridla-item="a"')
    expect(html).toContain('data-gridla-item="b"')
    expect(html).toContain('data-gridla-drag-handle="a"')
    expect(html).not.toContain('data-gridla-drag-handle="b"')
    expect(html).toContain('data-gridla-resize-handle="a"')
    expect(html).toContain('data-gridla-edge="se"')
    expect(html).toContain('Item A')
    expect(html).toContain('translate(500px, 0px)')
    expect(html).toContain('width:1000px')
    expect(html).not.toContain('data-gridla-preview')
    expect(html).not.toContain('data-gridla-active')
  })

  it('renders a controlled layout inside a transfer scope', async () => {
    const html = await render(
      jsx(GridTransferScope, {
        children: jsx(GridProvider, {
          layout: layoutFixture(),
          gap: 12,
          children: jsx(GridCanvas, {
            style: { height: '600px' },
            children: item('c', { positioning: 'absolute' }, 'Item C'),
          }),
        }),
      }),
    )
    expect(html).toContain('data-gridla-item="c"')
    expect(html).toContain('top:300px')
    expect(html).toContain('height:600px')
  })

  it('throws outside a provider', async () => {
    expect(render(jsx(GridCanvas, {}))).rejects.toThrow(/inside <GridProvider>/)
  })
})

describe('selectItemView', () => {
  const layout = layoutFixture()
  const base: GridState = {
    source: layout,
    size: null,
    layout,
    interaction: null,
    activeRect: null,
    preview: null,
    selectedId: 'b',
    transferring: false,
  }

  it('reads the rendered rect and the selection', () => {
    const view = selectItemView(base, 'b')
    expect(view.rect).toEqual({ x: 500, y: 0, w: 500, h: 300 })
    expect(view.isSelected).toBe(true)
    expect(view.isActive).toBe(false)
    expect(view.isShifted).toBe(false)
  })

  it('prefers the preview rect and flags pushed siblings', () => {
    const moved = { ...layout.items[0], x: 100 }
    const pushed = { ...layout.items[1], x: 600 }
    const preview = {
      layout: { ...layout, items: [moved, pushed, layout.items[2]] },
      item: moved,
      strategy: 'push-x' as const,
      shiftedSiblings: true,
      accepted: true,
    }
    const state: GridState = {
      ...base,
      interaction: {
        itemId: 'a',
        mode: 'move',
        pointerId: 1,
        grabOffset: { x: 0, y: 0 },
        origin: { x: 0, y: 0, w: 500, h: 300 },
        start: { x: 0, y: 0 },
      },
      activeRect: { x: 120, y: 4, w: 500, h: 300 },
      preview,
    }
    expect(selectItemView(state, 'a')).toMatchObject({
      rect: { x: 100, y: 0, w: 500, h: 300 },
      baseRect: { x: 0, y: 0, w: 500, h: 300 },
      activeRect: { x: 120, y: 4, w: 500, h: 300 },
      isActive: true,
      isShifted: false,
    })
    expect(selectItemView(state, 'b')).toMatchObject({ isShifted: true, isActive: false })
    expect(selectItemView(state, 'missing').rect).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })
})
