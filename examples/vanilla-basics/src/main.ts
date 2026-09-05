import '@gridla/demo-kit/tokens.css'
import '@gridla/demo-kit/demo.css'
import './style.css'

import {
  applyPreset,
  createItem,
  moveItem,
  placeItem,
  projectLayout,
  resizeItem,
  type GridLayout,
  type GridRect,
  type GridResizeEdge,
  type SolveResult,
} from 'gridla'
import { dashboardLayout, formatLayout, renderLayout } from '@gridla/demo-kit'

const stage = document.getElementById('stage') as HTMLDivElement
const canvasEl = document.getElementById('canvas') as HTMLDivElement
const previewEl = document.getElementById('preview') as HTMLDivElement
const dataEl = document.getElementById('data') as HTMLPreElement
const strategyEl = document.getElementById('strategy') as HTMLElement
const reasonEl = document.getElementById('reason') as HTMLElement
const gapInput = document.getElementById('gap') as HTMLInputElement
const snapInput = document.getElementById('snap') as HTMLInputElement
const scrollableInput = document.getElementById('scrollable') as HTMLInputElement

// The authored layout lives in its own coordinate space (960x600). We project
// it onto the stage's measured size so the demo is responsive; commits are
// written back in the rendered coordinate space.
let source: GridLayout = dashboardLayout()
let rendered: GridLayout = source
let counter = 0

const options = () => ({ gap: Number(gapInput.value), snapDistance: Number(snapInput.value) })

function measure() {
  const rect = stage.getBoundingClientRect()
  return { w: Math.round(rect.width), h: Math.round(rect.height) }
}

function project() {
  const size = measure()
  rendered = projectLayout(
    source,
    {
      ...source.canvas,
      width: size.w,
      height: size.h,
      heightMode: scrollableInput.checked ? 'scrollable' : 'bounded',
    },
    { gap: options().gap },
  )
  paint(rendered)
}

function paint(layout: GridLayout) {
  renderLayout(canvasEl, layout, { draggable: true })
  dataEl.textContent = formatLayout(layout)
}

function commit(result: SolveResult, reason: string) {
  strategyEl.textContent = result.strategy
  reasonEl.textContent = reason
  if (!result.accepted) return
  source = result.layout
  rendered = result.layout
  paint(rendered)
}

function showPreview(rect: GridRect | null) {
  previewEl.hidden = rect === null
  if (!rect) return
  previewEl.style.transform = `translate(${rect.x}px, ${rect.y}px)`
  previewEl.style.width = `${rect.w}px`
  previewEl.style.height = `${rect.h}px`
}

// ---------------------------------------------------------------------------
// Pointer handling: move by dragging the item, resize by dragging its
// bottom-right corner (last 14px of the item).
// ---------------------------------------------------------------------------

type Gesture =
  | { mode: 'move'; id: string; offset: { x: number; y: number }; result: SolveResult | null }
  | {
      mode: 'resize'
      id: string
      edge: GridResizeEdge
      start: { x: number; y: number }
      result: SolveResult | null
    }

let gesture: Gesture | null = null

function toLocal(event: PointerEvent) {
  const rect = stage.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

canvasEl.addEventListener('pointerdown', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-id]')
  if (!target) return
  const id = target.dataset.id as string
  const item = rendered.items.find((entry) => entry.id === id)
  if (!item) return
  const point = toLocal(event)
  const nearCorner = point.x > item.x + item.w - 14 && point.y > item.y + item.h - 14
  gesture = nearCorner
    ? { mode: 'resize', id, edge: 'se', start: point, result: null }
    : { mode: 'move', id, offset: { x: point.x - item.x, y: point.y - item.y }, result: null }
  canvasEl.setPointerCapture(event.pointerId)
  target.toggleAttribute('data-gridla-active', true)
  event.preventDefault()
})

canvasEl.addEventListener('pointermove', (event) => {
  if (!gesture) return
  const point = toLocal(event)
  const snap = !(event.ctrlKey || event.metaKey)
  const result =
    gesture.mode === 'move'
      ? moveItem({
          layout: rendered,
          itemId: gesture.id,
          position: { x: point.x - gesture.offset.x, y: point.y - gesture.offset.y },
          options: { ...options(), snap },
        })
      : resizeItem({
          layout: rendered,
          itemId: gesture.id,
          edge: gesture.edge,
          delta: { x: point.x - gesture.start.x, y: point.y - gesture.start.y },
          options: { ...options(), snap },
        })
  strategyEl.textContent = result.strategy + (result.accepted ? '' : ' (rejected)')
  if (result.accepted) {
    gesture.result = result
    // Paint siblings from the solver result so pushes and swaps are visible
    // live; keep the active element under the pointer while moving.
    renderLayout(canvasEl, result.layout, { draggable: true })
    if (gesture.mode === 'move') {
      const active = canvasEl.querySelector<HTMLElement>(`[data-id="${CSS.escape(gesture.id)}"]`)
      if (active)
        active.style.transform = `translate(${point.x - gesture.offset.x}px, ${point.y - gesture.offset.y}px)`
    }
    showPreview(result.item)
  }
})

function endGesture(commitResult: boolean) {
  if (!gesture) return
  const active = canvasEl.querySelector<HTMLElement>(`[data-id="${CSS.escape(gesture.id)}"]`)
  active?.removeAttribute('data-gridla-active')
  showPreview(null)
  if (commitResult && gesture.result) commit(gesture.result, gesture.mode)
  else paint(rendered)
  gesture = null
}

canvasEl.addEventListener('pointerup', () => endGesture(true))
canvasEl.addEventListener('pointercancel', () => endGesture(false))
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') endGesture(false)
})

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

gapInput.addEventListener('input', () => {
  document.getElementById('gap-out')!.textContent = gapInput.value
  project()
})
snapInput.addEventListener('input', () => {
  document.getElementById('snap-out')!.textContent = snapInput.value
})
scrollableInput.addEventListener('change', () => {
  stage.toggleAttribute('data-scrollable', scrollableInput.checked)
  project()
})

document.getElementById('add')!.addEventListener('click', () => {
  counter += 1
  const item = createItem(`new-${counter}`, { w: 220, h: 140, minW: 80, minH: 60 }, 0, 0, {
    label: `New ${counter}`,
  })
  commit(
    placeItem({
      layout: rendered,
      item,
      pointer: { x: rendered.canvas.width / 2, y: rendered.canvas.height / 2 },
      options: options(),
    }),
    'place',
  )
})
document.getElementById('rows')!.addEventListener('click', () => {
  source = applyPreset(rendered, 'rows', undefined, { gap: options().gap })
  rendered = source
  paint(rendered)
  reasonEl.textContent = 'preset: rows'
})
document.getElementById('grid')!.addEventListener('click', () => {
  source = applyPreset(rendered, 'grid', undefined, { gap: options().gap, columns: 2 })
  rendered = source
  paint(rendered)
  reasonEl.textContent = 'preset: grid'
})
document.getElementById('reset')!.addEventListener('click', () => {
  source = dashboardLayout()
  counter = 0
  project()
  reasonEl.textContent = 'reset'
})

new ResizeObserver(() => project()).observe(stage)
project()
