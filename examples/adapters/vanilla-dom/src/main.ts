import '@gridla/demo-kit/tokens.css'
import '@gridla/demo-kit/demo.css'
import './style.css'

import { createItem, type GridItem, type GridLayout } from 'gridla'
import {
  createTransferScope,
  mountGrid,
  type GridChangeDetail,
  type GridHandle,
  type GridItemView,
} from 'gridla/dom'
import { canvas, dashboardLayout, formatRect } from '@gridla/demo-kit'

// Demo app for `gridla/dom`: a dashboard with draggable, resizable items, a
// nested group (a second `mountGrid` inside an item) that shares a transfer
// scope with the outer canvas, a drop preview, and a status line showing the
// accepted change. The adapters e2e suite runs against this page.

type Data = { label: string }

const stage = document.getElementById('canvas') as HTMLElement
const status = document.getElementById('status') as HTMLElement
const scope = createTransferScope()

/** The dashboard fixture with its footer row turned into a nested group. */
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

let group: GridHandle<Data> | null = null

function renderItem(item: GridItem<Data>, element: HTMLElement, view: GridItemView) {
  if (!element.firstElementChild) {
    element.className = 'gd-item'
    element.innerHTML =
      '<div class="gd-item-head"><span></span><span class="gd-item-coords"></span></div><div class="gd-item-body"></div>'
  }
  const head = element.querySelector('.gd-item-head span')
  if (head) head.textContent = item.data?.label ?? item.id
  const coords = element.querySelector('.gd-item-coords')
  if (coords) coords.textContent = formatRect(view.rect)
  const body = element.querySelector<HTMLElement>('.gd-item-body')
  if (!body) return
  if (item.id !== 'group') {
    if (!body.textContent) body.textContent = 'drag · resize · arrow keys'
    return
  }
  if (group) return
  body.classList.add('nested-stage')
  group = mountGrid<Data>(body, {
    id: 'group',
    defaultLayout: groupLayout(),
    scope,
    gap: 12,
    snapDistance: 24,
    resizeEdges: ['e', 's', 'se'],
    resizeHandleClassName: 'gd-handle',
    preview: previewElement(),
    // The group must not be dropped into itself.
    acceptTransfers: (entry) => entry.id !== 'group',
    renderItem,
    onLayoutChange: (_layout, detail) => report(detail),
  })
}

function previewElement() {
  const element = document.createElement('div')
  element.className = 'gd-preview'
  return element
}

mountGrid<Data>(stage, {
  id: 'dashboard',
  defaultLayout: outerLayout(),
  scope,
  gap: 12,
  snapDistance: 24,
  resizeEdges: ['e', 's', 'se'],
  resizeHandleClassName: 'gd-handle',
  preview: previewElement(),
  renderItem,
  onLayoutChange: (_layout, detail) => report(detail),
})
