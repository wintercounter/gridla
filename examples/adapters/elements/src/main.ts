import '@gridla/demo-kit/tokens.css'
import '@gridla/demo-kit/demo.css'
import './style.css'

import { createItem, type GridLayout } from 'gridla'
import {
  defineGridlaElements,
  type GridChangeDetail,
  type GridlaCanvasElement,
  type GridlaLayoutChangeDetail,
} from 'gridla/elements'
import { canvas, dashboardLayout, formatRect } from '@gridla/demo-kit'

// Demo app for `gridla/elements`: the markup in index.html declares the
// canvases, items, previews, and the transfer scope; this script registers
// the elements, assigns the layouts, and mirrors changes into the status line.

type Data = { label: string }

defineGridlaElements()

const dashboard = document.getElementById('canvas') as GridlaCanvasElement<Data>
const group = document.getElementById('group-canvas') as GridlaCanvasElement<Data>
const status = document.getElementById('status') as HTMLElement

function outerLayout(): GridLayout<Data> {
  const base = dashboardLayout()
  return {
    // Scrollable: drops and pushes may grow the canvas downward.
    canvas: { ...base.canvas, heightMode: 'scrollable' },
    items: base.items.map((item) =>
      item.id === 'table' ? { ...item, id: 'group', minH: 140, data: { label: 'Group' } } : item,
    ),
  }
}

function groupLayout(): GridLayout<Data> {
  return {
    canvas: canvas(936, 160, 8),
    items: [
      createItem('note', { w: 450, h: 144, minW: 80, minH: 48 }, 8, 8, { label: 'Note' }),
      createItem('todo', { w: 458, h: 144, minW: 80, minH: 48 }, 470, 8, { label: 'To-do' }),
    ],
  }
}

function report(detail: GridChangeDetail) {
  status.textContent = `${detail.reason} · ${detail.strategy ?? 'none'} · ${detail.itemId ?? ''}`
}

/** Keep the coordinate readout of every item in step with the rendered layout. */
function readout(element: GridlaCanvasElement<Data>) {
  element.handle?.subscribe((state) => {
    for (const item of state.layout.items) {
      const coords = element.querySelector(
        `:scope > [data-gridla-item="${item.id}"] > .gd-item-head .gd-item-coords`,
      )
      if (coords) coords.textContent = formatRect(item)
    }
  })
}

for (const element of [dashboard, group]) {
  element.addEventListener('layout-change', (event) => {
    const { layout, change } = (event as CustomEvent<GridlaLayoutChangeDetail<Data>>).detail
    report(change)
    // An element created for a transferred item has no content yet.
    for (const item of layout.items) {
      const node = element.querySelector<HTMLElement>(`:scope > [data-gridla-item="${item.id}"]`)
      if (node && !node.firstElementChild) {
        node.className = 'gd-item'
        node.innerHTML = `<div class="gd-item-head"><span>${item.data?.label ?? item.id}</span><span class="gd-item-coords"></span></div><div class="gd-item-body">drag · resize · arrow keys</div>`
      }
    }
  })
}

// The group must not be dropped into itself.
group.acceptTransfers = (item) => item.id !== 'group'
dashboard.layout = outerLayout()
group.layout = groupLayout()

queueMicrotask(() => {
  readout(dashboard)
  readout(group)
})
