import { describe, expect, it } from 'bun:test'

import {
  applyPreset,
  createItem,
  flattenLayout,
  moveItem,
  placeItem,
  projectLayout,
  resizeItem,
  transferItem,
  type GridLayout,
  type GridNode,
} from 'gridla'

const layout: GridLayout = {
  canvas: { width: 1200, height: 720, padding: { top: 0, right: 0, bottom: 0, left: 0 }, heightMode: 'bounded' },
  items: [
    createItem('a', { w: 600, h: 360, minW: 40, minH: 40 }, 0, 0),
    createItem('b', { w: 600, h: 360, minW: 40, minH: 40 }, 600, 0),
    createItem('c', { w: 1200, h: 360, minW: 40, minH: 40 }, 0, 360),
  ],
}

describe('smoke', () => {
  it('moves an item with a swap', () => {
    const result = moveItem({ layout, itemId: 'a', position: { x: 600, y: 0 } })
    expect(result.accepted).toBe(true)
    expect(result.layout.items).toHaveLength(3)
    expect(layout.items[0].x).toBe(0)
  })
  it('resizes an item by edge', () => {
    const result = resizeItem({ layout, itemId: 'a', edge: 'e', delta: { x: -100, y: 0 } })
    expect(result.accepted).toBe(true)
    expect(result.item.w).toBe(500)
  })
  it('places an item', () => {
    const small = { ...layout, items: layout.items.slice(0, 1) }
    const result = placeItem({ layout: small, item: { id: 'n', w: 200, h: 100 }, position: { x: 700, y: 50 } })
    expect(result.accepted).toBe(true)
    expect(result.layout.items).toHaveLength(2)
  })
  it('transfers between layouts', () => {
    const empty: GridLayout = { canvas: layout.canvas, items: [] }
    const result = transferItem({ source: layout, target: empty, itemId: 'a', pointer: { x: 300, y: 200 } })
    expect(result.accepted).toBe(true)
    expect(result.source.items).toHaveLength(2)
    expect(result.target.items).toHaveLength(1)
  })
  it('projects a layout', () => {
    const projected = projectLayout(layout, { width: 600, height: 360 })
    expect(projected.items.find((i) => i.id === 'c')?.w).toBe(600)
  })
  it('applies presets and flattens a tree', () => {
    const rows = applyPreset(layout, 'rows')
    expect(rows.items.map((i) => i.y)).toEqual([0, 240, 480])
    const root: GridNode = {
      id: 'root',
      layout,
      children: [{ id: 'a' }, { id: 'b' }, { id: 'c', layout: rows, children: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }],
    }
    const flat = flattenLayout(root, { x: 0, y: 0, w: 600, h: 360 })
    expect(flat.items.map((i) => i.id)).toEqual(['root', 'a', 'b', 'c', 'a', 'b', 'c'])
  })
})
