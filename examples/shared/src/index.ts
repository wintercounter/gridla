/**
 * Framework-neutral helpers for demos: layout fixtures, DOM rendering of a
 * layout, an inspector table, and URL state helpers.
 */

import { createItem, type GridItem, type GridLayout, type GridRect } from 'gridla'

export {
  highlightHtml,
  renderCode,
  tokenize,
  tokenizeWithOffsets,
  type Token,
  type TokenKind,
} from './highlight'

export const NO_PADDING = { top: 0, right: 0, bottom: 0, left: 0 }

export function canvas(width: number, height: number, padding = 0, scrollable = false) {
  return {
    width,
    height,
    padding: { top: padding, right: padding, bottom: padding, left: padding },
    heightMode: scrollable ? ('scrollable' as const) : ('bounded' as const),
  }
}

/** A dashboard-like layout: header, two columns, one wide footer row. */
export function dashboardLayout(gap = 12): GridLayout<{ label: string }> {
  const c = canvas(960, 600, 12)
  const inner = c.width - 24
  const half = Math.floor((inner - gap) / 2)
  return {
    canvas: c,
    items: [
      createItem('header', { w: inner, h: 72, minW: 120, minH: 48, sizeMode: 'fixed-h' }, 12, 12, {
        label: 'Header',
      }),
      createItem('chart', { w: half, h: 280, minW: 160, minH: 120 }, 12, 12 + 72 + gap, {
        label: 'Chart',
      }),
      createItem(
        'sidebar',
        { w: inner - half - gap, h: 280, minW: 120, minH: 120 },
        12 + half + gap,
        12 + 72 + gap,
        { label: 'Sidebar' },
      ),
      createItem(
        'table',
        { w: inner, h: 600 - 24 - 72 - 280 - gap * 2, minW: 160, minH: 80 },
        12,
        12 + 72 + gap + 280 + gap,
        { label: 'Table' },
      ),
    ],
  }
}

/** Three equal columns and a header. */
export function columnsLayout(count = 3, gap = 12): GridLayout<{ label: string }> {
  const c = canvas(960, 600, 0)
  const width = Math.floor((c.width - gap * (count - 1)) / count)
  const items: GridItem<{ label: string }>[] = [
    createItem('header', { w: c.width, h: 64, minH: 40, sizeMode: 'fixed-h' }, 0, 0, {
      label: 'Header',
    }),
  ]
  for (let i = 0; i < count; i += 1) {
    const w = i === count - 1 ? c.width - i * (width + gap) : width
    items.push(
      createItem(
        `col-${i + 1}`,
        { w, h: 600 - 64 - gap, minW: 80, minH: 80 },
        i * (width + gap),
        64 + gap,
        {
          label: `Column ${i + 1}`,
        },
      ),
    )
  }
  return { canvas: c, items }
}

export function tiledLayout(
  count: number,
  columns: number,
  gap = 8,
): GridLayout<{ label: string }> {
  const c = canvas(960, 600, 0)
  const rows = Math.ceil(count / columns)
  const w = Math.floor((c.width - gap * (columns - 1)) / columns)
  const h = Math.floor((c.height - gap * (rows - 1)) / rows)
  const items: GridItem<{ label: string }>[] = []
  for (let i = 0; i < count; i += 1) {
    const col = i % columns
    const row = Math.floor(i / columns)
    items.push(
      createItem(`item-${i + 1}`, { w, h, minW: 24, minH: 24 }, col * (w + gap), row * (h + gap), {
        label: `Item ${i + 1}`,
      }),
    )
  }
  return { canvas: c, items }
}

export function formatRect(rect: GridRect): string {
  return `${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.w)}×${Math.round(rect.h)}`
}

/** Compact JSON for inspectors: one item per line. */
export function formatLayout(layout: GridLayout): string {
  const items = layout.items
    .map((item) => {
      const rest = Object.entries(item)
        .filter(([key]) => !['id', 'x', 'y', 'w', 'h'].includes(key))
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      const tail = rest.length > 0 ? `, ${rest.join(', ')}` : ''
      return `    { id: "${item.id}", x: ${item.x}, y: ${item.y}, w: ${item.w}, h: ${item.h}${tail} }`
    })
    .join(',\n')
  return `{\n  canvas: ${JSON.stringify(layout.canvas)},\n  items: [\n${items}\n  ]\n}`
}

// ---------------------------------------------------------------------------
// Vanilla DOM rendering
// ---------------------------------------------------------------------------

export type RenderOptions = {
  label?: (item: GridItem) => string
  className?: string
  /**
   * Mark items as draggable (`data-draggable`) so they get the grab cursor.
   * Static paintings leave it off and keep the default cursor.
   */
  draggable?: boolean | ((item: GridItem) => boolean)
}

/**
 * Paint a layout into a container. Items are keyed by id so repeated calls
 * update in place and CSS transitions animate the change.
 */
export function renderLayout(
  container: HTMLElement,
  layout: GridLayout,
  options: RenderOptions = {},
) {
  const seen = new Set<string>()
  for (const item of layout.items) {
    seen.add(item.id)
    let element = container.querySelector<HTMLElement>(`[data-id="${CSS.escape(item.id)}"]`)
    if (!element) {
      element = document.createElement('div')
      element.dataset.id = item.id
      element.className = options.className ?? 'gd-item'
      element.innerHTML =
        '<div class="gd-item-head"><span></span><span class="gd-item-coords"></span></div><div class="gd-item-body"></div>'
      container.append(element)
    }
    const draggable =
      typeof options.draggable === 'function'
        ? options.draggable(item)
        : (options.draggable ?? false)
    element.toggleAttribute('data-draggable', draggable)
    const data = (item.data ?? {}) as { label?: string }
    const label = options.label?.(item) ?? data.label ?? item.id
    const head = element.querySelector('.gd-item-head span')
    if (head) head.textContent = label
    const coords = element.querySelector('.gd-item-coords')
    if (coords) coords.textContent = formatRect(item)
    element.style.position = 'absolute'
    element.style.left = '0'
    element.style.top = '0'
    element.style.width = `${item.w}px`
    element.style.height = `${item.h}px`
    element.style.transform = `translate(${item.x}px, ${item.y}px)`
    element.toggleAttribute('data-locked', item.policy?.movement === 'locked')
    element.toggleAttribute('data-ghost', item.policy?.collision === 'ignore')
  }
  for (const element of Array.from(container.querySelectorAll<HTMLElement>('[data-id]'))) {
    if (!seen.has(element.dataset.id ?? '')) element.remove()
  }
}

// ---------------------------------------------------------------------------
// URL state
// ---------------------------------------------------------------------------

/** Read a demo's state from the URL hash (`#key=value&...`). */
export function readHashState<T extends Record<string, string | number | boolean>>(defaults: T): T {
  if (typeof location === 'undefined') return { ...defaults }
  const params = new URLSearchParams(location.hash.replace(/^#/, ''))
  const next = { ...defaults } as Record<string, string | number | boolean>
  for (const [key, fallback] of Object.entries(defaults)) {
    const raw = params.get(key)
    if (raw === null) continue
    if (typeof fallback === 'number') next[key] = Number(raw)
    else if (typeof fallback === 'boolean') next[key] = raw === '1' || raw === 'true'
    else next[key] = raw
  }
  return next as T
}

export function writeHashState(state: Record<string, string | number | boolean>) {
  if (typeof history === 'undefined') return
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(state)) params.set(key, String(value))
  history.replaceState(null, '', `#${params.toString()}`)
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export type Theme = 'light' | 'dark' | 'system'

export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  if (theme === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem('gridla-theme', theme)
  } catch {
    // storage unavailable
  }
}

export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem('gridla-theme')
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // storage unavailable
  }
  return 'system'
}
