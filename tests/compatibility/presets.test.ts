import { describe, expect, it } from 'bun:test'

import { applyPreset, type GridLayout } from 'gridla'

const ids = ['feed-a', 'feed-b', 'note']
// Neighbors sit 18 px apart, so `applyPreset` infers gap=18 from the layout.
const layout: GridLayout = {
  canvas: {
    width: 1200,
    height: 720,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    heightMode: 'bounded',
  },
  items: [
    { id: 'feed-a', x: 0, y: 0, w: 591, h: 720, minW: 40, minH: 240 },
    { id: 'feed-b', x: 609, y: 0, w: 591, h: 720, minW: 40, minH: 240 },
    { id: 'note', x: 0, y: 0, w: 591, h: 720, minW: 40, minH: 40 },
  ],
}

describe('layout presets', () => {
  it('splits a bounded container into visible rows', () => {
    expect(applyPreset(layout, 'rows', ids).items).toEqual([
      { id: 'feed-a', x: 0, y: 0, w: 1200, h: 228, minW: 40, minH: 228 },
      { id: 'feed-b', x: 0, y: 246, w: 1200, h: 228, minW: 40, minH: 228 },
      { id: 'note', x: 0, y: 492, w: 1200, h: 228, minW: 40, minH: 40 },
    ])
  })

  it('keeps grid to two columns and fits the second row in a bounded container', () => {
    expect(applyPreset(layout, 'grid', ids).items).toEqual([
      { id: 'feed-a', x: 0, y: 0, w: 591, h: 351, minW: 40, minH: 240 },
      { id: 'feed-b', x: 609, y: 0, w: 591, h: 351, minW: 40, minH: 240 },
      { id: 'note', x: 0, y: 369, w: 591, h: 351, minW: 40, minH: 40 },
    ])
  })

  it('keeps columns in one row when columns fit', () => {
    expect(applyPreset(layout, 'columns', ids).items).toEqual([
      { id: 'feed-a', x: 0, y: 0, w: 388, h: 720, minW: 40, minH: 240 },
      { id: 'feed-b', x: 406, y: 0, w: 388, h: 720, minW: 40, minH: 240 },
      { id: 'note', x: 812, y: 0, w: 388, h: 720, minW: 40, minH: 40 },
    ])
  })
})
