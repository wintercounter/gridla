/**
 * Deterministic studio documents for the browser tests. The studio's own
 * templates mint ids at runtime, so specs that need to address items by id
 * seed one of these through storage instead (see `openStudioDocument`).
 *
 * All pages are 1200 wide with a 24 px inset and a scrollable root; every
 * group is a bounded 12 px inset canvas. Groups render a ~30 px head above
 * their canvas, so a group's children are projected onto (h - head) and read
 * a little shorter than authored.
 */

type Rect = { x: number; y: number; w: number; h: number }
type Item = Rect & { id: string } & Record<string, unknown>
type Node = {
  id: string
  kind: string
  props: Record<string, unknown>
  gap?: number
  minHeight?: number
  layout?: { canvas: Canvas; items: Item[] }
  children?: Node[]
}
type Canvas = {
  width: number
  height: number
  padding: { top: number; right: number; bottom: number; left: number }
  heightMode: 'bounded' | 'scrollable'
}
type Placed = { node: Node; item: Item }

export type StudioDocumentJson = {
  format: 'gridla-studio'
  version: 1
  name: string
  root: Node
}

const inset = (n: number) => ({ top: n, right: n, bottom: n, left: n })

/** A leaf block. Kind-specific props fall back to the studio defaults. */
export function leaf(
  kind: string,
  id: string,
  rect: Rect,
  extra: Record<string, unknown> = {},
  props: Record<string, unknown> = {},
): Placed {
  return { node: { id, kind, props }, item: { id, ...rect, ...extra } }
}

/** A group with its own bounded canvas sized to the group. */
export function group(
  id: string,
  title: string,
  rect: Rect,
  children: Placed[],
  extra: Record<string, unknown> = {},
): Placed {
  return {
    node: {
      id,
      kind: 'group',
      props: { title, tone: 'outlined' },
      gap: 12,
      layout: {
        canvas: { width: rect.w, height: rect.h, padding: inset(12), heightMode: 'bounded' },
        items: children.map((child) => child.item),
      },
      children: children.map((child) => child.node),
    },
    item: { id, ...rect, ...extra },
  }
}

export function page(name: string, children: Placed[], height = 720): StudioDocumentJson {
  return {
    format: 'gridla-studio',
    version: 1,
    name,
    root: {
      id: 'root',
      kind: 'group',
      props: { title: 'Page', tone: 'plain' },
      gap: 16,
      minHeight: height,
      layout: {
        canvas: { width: 1200, height, padding: inset(24), heightMode: 'scrollable' },
        items: children.map((child) => child.item),
      },
      children: children.map((child) => child.node),
    },
  }
}

const BUTTON = { minW: 96, minH: 44, maxH: 96, sizeMode: 'fixed' } as const
const TEXT = { minW: 120, minH: 60 } as const

/**
 * Two stacked groups over a loose note:
 *
 *   header 24,24   1152x200  title (text 12,12 500x176) · action (button 524,12 180x56)
 *   body   24,240  1152x300  left  (text 12,12 560x276) · right (chart 584,12 400x140)
 *   note   24,556  400x140
 *
 * The header keeps a 424x176 free area at its east end so a body child can be
 * dropped into it; the 16 px gap between the groups is the inter-group drop
 * target.
 */
export function nestedDocument() {
  return page('Nested groups', [
    group('header', 'Header', { x: 24, y: 24, w: 1152, h: 200 }, [
      leaf('text', 'title', { x: 12, y: 12, w: 500, h: 176 }, TEXT, { body: 'Title' }),
      leaf('button', 'action', { x: 524, y: 12, w: 180, h: 56 }, BUTTON, { label: 'Action' }),
    ]),
    group('body', 'Body', { x: 24, y: 240, w: 1152, h: 300 }, [
      leaf('text', 'left', { x: 12, y: 12, w: 560, h: 276 }, TEXT, { body: 'Left' }),
      leaf('chart', 'right', { x: 584, y: 12, w: 400, h: 140 }, { minW: 140, minH: 100 }),
    ]),
    leaf('text', 'note', { x: 24, y: 556, w: 400, h: 140 }, TEXT, { body: 'Note' }),
  ])
}

/**
 * A fully packed group (two texts fill its canvas) beside a loose text:
 *
 *   pack 24,24  800x240  a (12,12 376x216) · b (400,12 388x216)
 *   side 840,24 336x240
 */
export function packedDocument() {
  return page('Packed group', [
    group('pack', 'Packed', { x: 24, y: 24, w: 800, h: 240 }, [
      leaf('text', 'a', { x: 12, y: 12, w: 376, h: 216 }, TEXT, { body: 'A' }),
      leaf('text', 'b', { x: 400, y: 12, w: 388, h: 216 }, TEXT, { body: 'B' }),
    ]),
    leaf('text', 'side', { x: 840, y: 24, w: 336, h: 240 }, TEXT, { body: 'Side' }),
  ])
}

/**
 * Locks and fixed sizes:
 *
 *   header 24,24  1152x200 (fixed height)
 *     title  (text 12,12 600x176, movement locked)
 *     action (button 624,12 180x56, fixed)
 *     pin    (image 816,12 121x36, fixed)
 *   body   24,360 1152x300 (movement locked)  left (text 12,12 1128x276)
 *   card   24,676 320x200 (fixed)
 *
 * The 136 px gap under the header leaves it room to grow before it meets the
 * locked group.
 */
export function locksDocument() {
  return page('Locks', [
    group(
      'header',
      'Header',
      { x: 24, y: 24, w: 1152, h: 200 },
      [
        leaf(
          'text',
          'title',
          { x: 12, y: 12, w: 600, h: 176 },
          { ...TEXT, policy: { movement: 'locked' } },
          { body: 'Title' },
        ),
        leaf('button', 'action', { x: 624, y: 12, w: 180, h: 56 }, BUTTON, { label: 'Action' }),
        leaf(
          'image',
          'pin',
          { x: 816, y: 12, w: 121, h: 36 },
          { minW: 40, minH: 24, sizeMode: 'fixed' },
          { label: 'Pin' },
        ),
      ],
      { sizeMode: 'fixed-h', minH: 120 },
    ),
    group(
      'body',
      'Body',
      { x: 24, y: 360, w: 1152, h: 300 },
      [leaf('text', 'left', { x: 12, y: 12, w: 1128, h: 276 }, TEXT, { body: 'Left' })],
      { policy: { movement: 'locked' } },
    ),
    leaf(
      'image',
      'card',
      { x: 24, y: 676, w: 320, h: 200 },
      { minW: 60, minH: 60, sizeMode: 'fixed' },
      { label: 'Card' },
    ),
  ])
}

/**
 * A group over two loose texts:
 *
 *   header 24,24  1152x200  title (text 12,12 700x176) · action (button 724,12 180x56)
 *   alpha  24,240 400x160 · beta 440,240 400x160
 */
export function actionsDocument() {
  return page('Actions', [
    group('header', 'Header', { x: 24, y: 24, w: 1152, h: 200 }, [
      leaf('text', 'title', { x: 12, y: 12, w: 700, h: 176 }, TEXT, { body: 'Title' }),
      leaf('button', 'action', { x: 724, y: 12, w: 180, h: 56 }, BUTTON, { label: 'Action' }),
    ]),
    leaf('text', 'alpha', { x: 24, y: 240, w: 400, h: 160 }, TEXT, { body: 'Alpha' }),
    leaf('text', 'beta', { x: 440, y: 240, w: 400, h: 160 }, TEXT, { body: 'Beta' }),
  ])
}
