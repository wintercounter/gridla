import { leaf, node, type FixtureNode } from './nodes'

/**
 * A sharing page: a locked fixed-height header (title, link card, fixed-size
 * settings button), a row of four fixed-height stat cards, and two feed
 * tables that fill the rest of the page. Geometry mirrors a real authored
 * page; ids and kinds are neutral.
 */
export function sharingPage(): FixtureNode {
  return node({
    id: 'sharing-page',
    kind: 'group',
    gap: 'lg',
    padding: 'lg',
    order: ['header', 'stat-1', 'stat-2', 'stat-3', 'stat-4', 'feed-a', 'feed-b'],
    layout: {
      canvas: {
        width: 2009,
        height: 1158,
        padding: { top: 18, right: 18, bottom: 18, left: 18 },
        heightMode: 'bounded',
      },
      items: [
        {
          id: 'header',
          x: 18,
          y: 18,
          w: 1973,
          h: 38,
          minW: 100,
          minH: 38,
          maxH: 38,
          sizeMode: 'fixed-h',
          fixedHeight: 38,
          policy: { movement: 'locked' },
        },
        {
          id: 'stat-1',
          x: 18,
          y: 74,
          w: 480,
          h: 140,
          minW: 100,
          minH: 140,
          maxH: 140,
          sizeMode: 'fixed-h',
          fixedHeight: 140,
        },
        {
          id: 'stat-2',
          x: 516,
          y: 74,
          w: 482,
          h: 140,
          minW: 100,
          minH: 140,
          maxH: 140,
          sizeMode: 'fixed-h',
          fixedHeight: 140,
        },
        {
          id: 'stat-3',
          x: 1016,
          y: 74,
          w: 480,
          h: 140,
          minW: 100,
          minH: 140,
          maxH: 140,
          sizeMode: 'fixed-h',
          fixedHeight: 140,
        },
        {
          id: 'stat-4',
          x: 1514,
          y: 74,
          w: 477,
          h: 140,
          minW: 100,
          minH: 140,
          maxH: 140,
          sizeMode: 'fixed-h',
          fixedHeight: 140,
        },
        { id: 'feed-a', x: 18, y: 232, w: 979, h: 908, minW: 100, minH: 1 },
        { id: 'feed-b', x: 1016, y: 232, w: 975, h: 908, minW: 100, minH: 1 },
      ],
    },
    children: [
      node({
        id: 'header',
        kind: 'group',
        locked: true,
        scrollable: false,
        gap: 'md',
        order: ['title', 'link-card', 'settings-button'],
        layout: {
          canvas: {
            width: 1200,
            height: 720,
            padding: { top: 0, right: 0, bottom: 0, left: 0 },
            heightMode: 'bounded',
          },
          items: [
            { id: 'title', x: 0, y: 0, w: 511, h: 720, minW: 100, minH: 1 },
            { id: 'link-card', x: 523, y: 0, w: 627, h: 720, minW: 100, minH: 1 },
            {
              id: 'settings-button',
              x: 1162,
              y: 0,
              w: 38,
              h: 38,
              minW: 38,
              minH: 38,
              maxW: 38,
              maxH: 38,
              sizeMode: 'fixed',
              fixedWidth: 38,
              fixedHeight: 38,
              policy: { movement: 'locked' },
            },
          ],
        },
        children: [
          leaf('title', 'text'),
          leaf('link-card', 'card'),
          leaf('settings-button', 'control'),
        ],
      }),
      leaf('stat-1', 'stat'),
      leaf('stat-2', 'stat'),
      leaf('stat-3', 'stat'),
      leaf('stat-4', 'stat'),
      leaf('feed-a', 'table'),
      leaf('feed-b', 'table'),
    ],
  })
}
