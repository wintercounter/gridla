import { createItem, type GridLayout } from 'gridla'
import { canvas } from '@gridla/demo-kit'

export type Data = { label: string }

/**
 * Outer dashboard: header, chart, and a tall group that hosts a nested canvas.
 * The space under the chart stays free so items dragged out of the group have
 * room to land, and the group is tall enough to take them back.
 */
export function outerLayout(): GridLayout<Data> {
  const c = canvas(960, 600, 12)
  const gap = 12
  const inner = c.width - 24
  const half = Math.floor((inner - gap) / 2)
  const top = 12 + 72 + gap
  return {
    canvas: c,
    items: [
      createItem('header', { w: inner, h: 72, minW: 120, minH: 48, sizeMode: 'fixed-h' }, 12, 12, {
        label: 'Header',
      }),
      createItem('chart', { w: half, h: 280, minW: 160, minH: 120 }, 12, top, {
        label: 'Chart',
      }),
      createItem(
        'group',
        { w: inner - half - gap, h: c.height - 12 - top, minW: 200, minH: 160 },
        12 + half + gap,
        top,
        { label: 'Group' },
      ),
    ],
  }
}

/** Nested layout rendered inside the `group` item. */
export function innerLayout(): GridLayout<Data> {
  return {
    canvas: canvas(440, 440, 8),
    items: [
      createItem('note-1', { w: 200, h: 100, minW: 80, minH: 60 }, 8, 8, { label: 'Note 1' }),
      createItem('note-2', { w: 200, h: 100, minW: 80, minH: 60 }, 224, 8, { label: 'Note 2' }),
    ],
  }
}
