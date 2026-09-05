import '@gridla/demo-kit/tokens.css'
import '@gridla/demo-kit/demo.css'
import './style.css'

import { projectLayout, type GridItem, type GridLayout } from 'gridla'
import { dashboardLayout, formatRect } from '@gridla/demo-kit'

// Scaffold for the DOM adapter demo. It renders a static layout with the core
// package only; once `gridla/dom` lands this file switches to `mountGrid` and
// the hand-written renderer below goes away. The data attributes match the
// shared adapter contract (see docs/private/adapters-brief.md) so the
// adapters e2e suite can already run against this app.

const canvas = document.getElementById('canvas') as HTMLElement
const note = document.getElementById('note') as HTMLElement

const source: GridLayout<{ label: string }> = dashboardLayout()

function measure() {
  const rect = canvas.getBoundingClientRect()
  return { w: Math.round(rect.width), h: Math.round(rect.height) }
}

function elementFor(item: GridItem): HTMLElement {
  let element = canvas.querySelector<HTMLElement>(`[data-gridla-item="${CSS.escape(item.id)}"]`)
  if (!element) {
    element = document.createElement('div')
    element.className = 'gd-item'
    element.setAttribute('data-gridla-item', item.id)
    element.innerHTML =
      '<div class="gd-item-head"><span></span><span class="gd-item-coords"></span></div><div class="gd-item-body">static · projected to the stage</div>'
    canvas.append(element)
  }
  return element
}

function paint(layout: GridLayout<{ label: string }>) {
  const seen = new Set<string>()
  for (const item of layout.items) {
    seen.add(item.id)
    const element = elementFor(item)
    const head = element.querySelector('.gd-item-head span')
    if (head) head.textContent = item.data?.label ?? item.id
    const coords = element.querySelector('.gd-item-coords')
    if (coords) coords.textContent = formatRect(item)
    element.style.position = 'absolute'
    element.style.left = '0'
    element.style.top = '0'
    element.style.width = `${item.w}px`
    element.style.height = `${item.h}px`
    element.style.transform = `translate(${item.x}px, ${item.y}px)`
  }
  for (const element of Array.from(canvas.querySelectorAll<HTMLElement>('[data-gridla-item]'))) {
    if (!seen.has(element.getAttribute('data-gridla-item') ?? '')) element.remove()
  }
  note.textContent = `${layout.items.length} items · canvas ${layout.canvas.width}x${layout.canvas.height}`
}

function project() {
  const size = measure()
  paint(projectLayout(source, { ...source.canvas, width: size.w, height: size.h }))
}

project()
new ResizeObserver(project).observe(canvas)
