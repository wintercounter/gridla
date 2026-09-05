import { computed, defineComponent, h, ref, type VNode } from 'vue'

import {
  createItem,
  type GridChangeDetail,
  type GridItem as GridItemModel,
  type GridLayout,
} from 'gridla'
import {
  GridCanvas,
  GridItem,
  GridPreviewOutline,
  GridProvider,
  GridTransferScope,
  type GridItemSlotProps,
} from 'gridla/vue'
import { canvas, formatRect } from '@gridla/demo-kit'

type Data = { label: string }

const EDGES = ['e', 's', 'se'] as const

/** Header, chart, a group hosting its own canvas, and a wide table row. */
function outerLayout(): GridLayout<Data> {
  const c = canvas(960, 600, 12)
  const gap = 12
  const inner = c.width - 24
  const half = Math.floor((inner - gap) / 2)
  return {
    canvas: c,
    items: [
      createItem('header', { w: inner, h: 72, minW: 120, minH: 48, sizeMode: 'fixed-h' }, 12, 12, {
        label: 'Header',
      }),
      createItem('chart', { w: half, h: 280, minW: 160, minH: 120 }, 12, 96, { label: 'Chart' }),
      createItem(
        'group',
        { w: inner - half - gap, h: 280, minW: 200, minH: 160 },
        12 + half + gap,
        96,
        {
          label: 'Group',
        },
      ),
      createItem(
        'table',
        { w: inner, h: 600 - 24 - 72 - 280 - gap * 2, minW: 160, minH: 80 },
        12,
        388,
        {
          label: 'Table',
        },
      ),
    ],
  }
}

/** Two notes inside the group. */
function groupLayout(): GridLayout<Data> {
  return {
    canvas: canvas(462, 240, 8),
    items: [
      createItem('note-1', { w: 210, h: 100, minW: 80, minH: 60 }, 8, 8, { label: 'Note 1' }),
      createItem('note-2', { w: 210, h: 100, minW: 80, minH: 60 }, 236, 8, { label: 'Note 2' }),
    ],
  }
}

function labelOf(item: GridItemModel<Data>) {
  return item.data?.label ?? item.id
}

/** Compact JSON: one line per item, in the canvas the layout was rendered at. */
function readout(layout: GridLayout<Data>) {
  return JSON.stringify(
    {
      canvas: { width: layout.canvas.width, height: layout.canvas.height },
      items: layout.items.map((item) => ({
        id: item.id,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
      })),
    },
    null,
    2,
  )
}

/** Head row shared by every tile: label and coordinates. */
function tileHead(
  item: GridItemModel<Data>,
  view: GridItemSlotProps,
  extra: Record<string, unknown> = {},
) {
  return h('div', { class: 'gd-item-head', ...extra }, [
    h('span', labelOf(item)),
    h('span', { class: 'gd-item-coords' }, formatRect(view.rect)),
  ])
}

export const App = defineComponent({
  name: 'App',
  setup() {
    const outer = ref(outerLayout())
    const group = ref(groupLayout())
    const status = ref('idle')

    // `layout-change` also covers keyboard nudges; `commit` fires for pointer gestures only.
    const report = (where: string) => (_layout: GridLayout<Data>, detail: GridChangeDetail) => {
      status.value = `${where} · ${detail.reason} · ${detail.strategy ?? 'none'} · ${detail.itemId ?? ''}`
    }
    const outerJson = computed(() => readout(outer.value))
    const groupJson = computed(() => readout(group.value))

    const tile = (item: GridItemModel<Data>, body: string): VNode =>
      h(
        GridItem,
        {
          key: item.id,
          id: item.id,
          class: 'gd-item',
          resizeEdges: EDGES,
          resizeHandleClass: 'gd-handle',
        },
        {
          default: (view: GridItemSlotProps) => [
            tileHead(item, view),
            h('div', { class: 'gd-item-body' }, body),
          ],
        },
      )

    const groupTile = (item: GridItemModel<Data>): VNode =>
      h(
        GridItem,
        {
          key: item.id,
          id: item.id,
          class: 'gd-item group',
          draggable: false,
          resizeEdges: EDGES,
          resizeHandleClass: 'gd-handle',
        },
        {
          default: (view: GridItemSlotProps) => [
            // Only the head starts a move of the group; the canvas below owns its own pointer events.
            tileHead(item, view, view.dragHandleProps),
            h(
              GridProvider,
              {
                layout: group.value,
                'onUpdate:layout': (next: GridLayout<Data>) => {
                  group.value = next
                },
                onLayoutChange: report('group'),
                gap: 8,
              },
              () =>
                h(
                  GridCanvas,
                  {
                    class: 'group-canvas',
                    onPointerdown: (event: PointerEvent) => event.stopPropagation(),
                  },
                  () => [
                    ...group.value.items.map((note) => tile(note, 'nested · drag me out')),
                    h(GridPreviewOutline, { class: 'gd-preview' }),
                  ],
                ),
            ),
          ],
        },
      )

    return () =>
      h('main', { class: 'page' }, [
        h('header', { class: 'page-head' }, [
          h('div', [
            h('h1', 'Gridla with Vue'),
            h('p', [
              'Components written with ',
              h('code', 'defineComponent'),
              ' and ',
              h('code', 'h'),
              ', bound with ',
              h('code', 'v-model:layout'),
              '. The group is a nested provider inside a transfer scope: drag a note out onto the dashboard, or a dashboard tile into the group.',
            ]),
          ]),
        ]),
        h(GridTransferScope, null, () =>
          h('section', { class: 'gd-stage stage' }, [
            h('div', { class: 'gd-stage-inner stage-inner' }, [
              h(
                GridProvider,
                {
                  layout: outer.value,
                  'onUpdate:layout': (next: GridLayout<Data>) => {
                    outer.value = next
                  },
                  onLayoutChange: report('outer'),
                  gap: 12,
                },
                () =>
                  h(GridCanvas, { class: 'stage-inner' }, () => [
                    ...outer.value.items.map((item) =>
                      item.id === 'group'
                        ? groupTile(item)
                        : tile(item, 'drag · resize · arrow keys'),
                    ),
                    h(GridPreviewOutline, { class: 'gd-preview' }),
                  ]),
              ),
            ]),
          ]),
        ),
        h('p', { class: 'page-note', id: 'status' }, `last commit: ${status.value}`),
        h('div', { class: 'readout gd-inspector' }, [
          h('pre', { id: 'layout-json' }, outerJson.value),
          h('pre', { id: 'group-json' }, groupJson.value),
        ]),
      ])
  },
})
