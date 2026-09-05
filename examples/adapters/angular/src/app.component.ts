import { Component, computed, signal } from '@angular/core'

import { createItem, type GridLayout } from 'gridla'
import {
  GridCanvasComponent,
  GridDragHandleDirective,
  GridItemDirective,
  GridPreviewOutlineComponent,
  GridProviderComponent,
  GridTransferScopeComponent,
  type GridChangeDetail,
} from 'gridla/angular'
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
        { label: 'Group' },
      ),
      createItem(
        'table',
        { w: inner, h: 600 - 24 - 72 - 280 - gap * 2, minW: 160, minH: 80 },
        12,
        388,
        { label: 'Table' },
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

/**
 * The dashboard: an outer provider bound with `[(layout)]`, a group item that
 * hosts a nested provider, both inside one transfer scope. `(layoutChangeDetail)`
 * feeds the status line; the JSON readouts render the two-way bound signals.
 */
@Component({
  selector: 'app-root',
  imports: [
    GridProviderComponent,
    GridCanvasComponent,
    GridItemDirective,
    GridDragHandleDirective,
    GridPreviewOutlineComponent,
    GridTransferScopeComponent,
  ],
  template: `
    <main class="page">
      <header class="page-head">
        <div>
          <h1>Gridla with Angular</h1>
          <p>
            Standalone components and directives with signals, bound with
            <code>[(layout)]</code>. The group is a nested provider inside a transfer scope: drag a
            note out onto the dashboard, or a dashboard tile into the group.
          </p>
        </div>
      </header>
      <gridla-transfer-scope>
        <section class="gd-stage stage">
          <div
            class="gd-stage-inner stage-inner"
            gridlaProvider
            [(layout)]="outer"
            [gap]="12"
            (layoutChangeDetail)="report('outer', $event.change)"
          >
            <gridla-canvas class="stage-canvas">
              @for (item of outer().items; track item.id) {
                @if (item.id === 'group') {
                  <div
                    class="gd-item group"
                    [gridlaItem]="item.id"
                    draggable="false"
                    [resizeEdges]="edges"
                    resizeHandleClass="gd-handle"
                  >
                    <!-- Only the head starts a move of the group; the canvas below owns its own pointer events. -->
                    <div class="gd-item-head" gridlaDragHandle>
                      <span>{{ item.data?.label ?? item.id }}</span>
                      <span class="gd-item-coords">{{ coords(item) }}</span>
                    </div>
                    <div
                      gridlaProvider
                      [(layout)]="group"
                      [gap]="8"
                      (layoutChangeDetail)="report('group', $event.change)"
                    >
                      <gridla-canvas class="group-canvas" (pointerdown)="$event.stopPropagation()">
                        @for (note of group().items; track note.id) {
                          <div
                            class="gd-item"
                            [gridlaItem]="note.id"
                            [resizeEdges]="edges"
                            resizeHandleClass="gd-handle"
                          >
                            <div class="gd-item-head">
                              <span>{{ note.data?.label ?? note.id }}</span>
                              <span class="gd-item-coords">{{ coords(note) }}</span>
                            </div>
                            <div class="gd-item-body">nested · drag me out</div>
                          </div>
                        }
                        <gridla-preview-outline class="gd-preview" />
                      </gridla-canvas>
                    </div>
                  </div>
                } @else {
                  <div
                    class="gd-item"
                    [gridlaItem]="item.id"
                    [resizeEdges]="edges"
                    resizeHandleClass="gd-handle"
                  >
                    <div class="gd-item-head">
                      <span>{{ item.data?.label ?? item.id }}</span>
                      <span class="gd-item-coords">{{ coords(item) }}</span>
                    </div>
                    <div class="gd-item-body">drag, resize, or nudge with the arrow keys</div>
                  </div>
                }
              }
              <gridla-preview-outline class="gd-preview" />
            </gridla-canvas>
          </div>
        </section>
      </gridla-transfer-scope>
      <div class="readout">
        <div class="gd-inspector-bar">
          <span>
            last commit: <b id="status" [attr.data-strategy]="strategy()">{{ status() }}</b>
          </span>
          <button class="gd-button" type="button" (click)="reset()">Reset layouts</button>
        </div>
        <pre class="gd-code" id="layout-json">{{ outerJson() }}</pre>
        <pre class="gd-code" id="group-json">{{ groupJson() }}</pre>
      </div>
    </main>
  `,
})
export class AppComponent {
  readonly edges = EDGES
  readonly outer = signal(outerLayout())
  readonly group = signal(groupLayout())
  readonly status = signal('idle')
  readonly strategy = signal<string | null>(null)
  readonly outerJson = computed(() => readout(this.outer()))
  readonly groupJson = computed(() => readout(this.group()))

  /** Coordinates from the bound layout; the directive paints the live rect. */
  coords(item: { x: number; y: number; w: number; h: number }) {
    return formatRect(item)
  }

  /** `layoutChangeDetail` also covers keyboard nudges; `commit` fires for pointer gestures only. */
  report(where: string, detail: GridChangeDetail) {
    this.strategy.set(detail.strategy ?? null)
    this.status.set(
      `${where} · ${detail.reason} · ${detail.strategy ?? 'none'} · ${detail.itemId ?? ''}`,
    )
  }

  /** Parent-driven update: new layout objects flow down through `[(layout)]`. */
  reset() {
    this.outer.set(outerLayout())
    this.group.set(groupLayout())
    this.status.set('reset')
    this.strategy.set(null)
  }
}
