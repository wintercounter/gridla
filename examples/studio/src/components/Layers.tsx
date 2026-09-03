/**
 * Layer tree synchronized with the selection. Rows form a roving-tabindex
 * list: arrows move focus, Enter focuses the item's canvas for nudging,
 * Shift+click extends the selection.
 */

import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'

import { isLocked } from 'gridla'

import { useCanvasRegistry } from '../canvas-registry'
import type { StudioNode } from '../document'
import { getKind } from '../registry'
import { useStudio } from '../store'

type Row = {
  node: StudioNode
  depth: number
  parent: StudioNode | null
  locked: boolean
  hasChildren: boolean
  collapsed: boolean
}

function flattenRows(root: StudioNode, collapsed: ReadonlySet<string>): Row[] {
  const rows: Row[] = []
  const visit = (node: StudioNode, parent: StudioNode | null, depth: number) => {
    const item = parent?.layout?.items.find((entry) => entry.id === node.id)
    const hasChildren = (node.children?.length ?? 0) > 0
    const isCollapsed = collapsed.has(node.id)
    rows.push({
      node,
      depth,
      parent,
      locked: item ? isLocked(item) : false,
      hasChildren,
      collapsed: isCollapsed,
    })
    if (!isCollapsed) for (const child of node.children ?? []) visit(child, node, depth + 1)
  }
  visit(root, null, 0)
  return rows
}

function label(node: StudioNode): string {
  const text = node.props.title ?? node.props.text ?? node.props.label ?? node.props.body
  if (typeof text === 'string' && text.trim()) {
    const line = text.trim().split('\n')[0]
    return line.length > 32 ? `${line.slice(0, 31)}…` : line
  }
  return getKind(node.kind).label
}

export function Layers() {
  const { state, dispatch } = useStudio()
  const registry = useCanvasRegistry()
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const listRef = useRef<HTMLUListElement | null>(null)
  const rows = useMemo(() => flattenRows(state.doc.root, collapsed), [state.doc.root, collapsed])
  const selection = useMemo(() => new Set(state.selection), [state.selection])
  const focusId = state.selection[state.selection.length - 1] ?? state.doc.root.id

  const toggle = useCallback((id: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const select = (event: MouseEvent, id: string) => {
    if (event.shiftKey && id !== state.doc.root.id) dispatch({ type: 'toggle-select', id })
    else dispatch({ type: 'select', ids: [id] })
  }

  const focusRow = (index: number) => {
    const buttons = listRef.current?.querySelectorAll<HTMLElement>('[data-row]')
    buttons?.[index]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent, row: Row, index: number) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusRow(Math.min(rows.length - 1, index + 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        focusRow(Math.max(0, index - 1))
        break
      case 'ArrowRight':
        if (row.hasChildren && row.collapsed) {
          event.preventDefault()
          toggle(row.node.id)
        }
        break
      case 'ArrowLeft':
        if (row.hasChildren && !row.collapsed) {
          event.preventDefault()
          toggle(row.node.id)
        }
        break
      case 'Enter': {
        event.preventDefault()
        dispatch({ type: 'select', ids: [row.node.id] })
        const groupId = row.parent?.id ?? row.node.id
        registry.get(groupId)?.getElement()?.focus()
        break
      }
      case ' ':
        event.preventDefault()
        if (row.node.id === state.doc.root.id) dispatch({ type: 'select', ids: [row.node.id] })
        else dispatch({ type: 'toggle-select', id: row.node.id })
        break
      default:
        break
    }
  }

  return (
    <div className="st-layers">
      <div className="st-layers-head">
        <h2 className="st-panel-title">Layers</h2>
        <span className="st-panel-hint">{rows.length - 1} nodes</span>
      </div>
      <ul className="st-layer-list" role="tree" aria-label="Layers" ref={listRef}>
        {rows.map((row, index) => {
          const isRoot = row.node.id === state.doc.root.id
          const selected = selection.has(row.node.id) || (isRoot && selection.size === 0)
          return (
            <li
              key={row.node.id}
              role="treeitem"
              aria-selected={selected}
              aria-expanded={row.hasChildren ? !row.collapsed : undefined}
              aria-level={row.depth + 1}
              className="st-layer"
              data-selected={selected ? '' : undefined}
              data-hidden={row.node.hidden ? '' : undefined}
              data-locked={row.locked ? '' : undefined}
              style={{ '--depth': row.depth } as React.CSSProperties}
            >
              {row.hasChildren ? (
                <button
                  type="button"
                  className="st-layer-toggle"
                  aria-label={row.collapsed ? 'Expand' : 'Collapse'}
                  tabIndex={-1}
                  onClick={() => toggle(row.node.id)}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                    <path
                      d={row.collapsed ? 'M3 1l4 4-4 4' : 'M1 3l4 4 4-4'}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>
                </button>
              ) : (
                <span className="st-layer-toggle" aria-hidden />
              )}
              <button
                type="button"
                className="st-layer-row"
                data-row=""
                tabIndex={row.node.id === focusId ? 0 : -1}
                onClick={(event) => select(event, row.node.id)}
                onDoubleClick={() => row.hasChildren && toggle(row.node.id)}
                onKeyDown={(event) => onKeyDown(event, row, index)}
                title={`${getKind(row.node.kind).label} · ${row.node.id}`}
              >
                <span className="st-layer-icon">{getKind(row.node.kind).icon}</span>
                <span className="st-layer-label">{isRoot ? 'Page' : label(row.node)}</span>
                {row.locked ? (
                  <span className="st-layer-badge" title="Locked">
                    lock
                  </span>
                ) : null}
                {row.node.hidden ? (
                  <span className="st-layer-badge" title="Hidden">
                    hidden
                  </span>
                ) : null}
              </button>
              {!isRoot ? (
                <span className="st-layer-tools">
                  <button
                    type="button"
                    className="st-icon-button"
                    tabIndex={-1}
                    aria-label={row.node.hidden ? 'Show' : 'Hide'}
                    title={row.node.hidden ? 'Show' : 'Hide'}
                    onClick={() => dispatch({ type: 'toggle-hidden', ids: [row.node.id] })}
                  >
                    <EyeGlyph off={!!row.node.hidden} />
                  </button>
                  <button
                    type="button"
                    className="st-icon-button"
                    tabIndex={-1}
                    aria-label={row.locked ? 'Unlock' : 'Lock'}
                    title={row.locked ? 'Unlock' : 'Lock'}
                    onClick={() => dispatch({ type: 'toggle-lock', ids: [row.node.id] })}
                  >
                    <LockGlyph open={!row.locked} />
                  </button>
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function EyeGlyph({ off }: { off: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden
    >
      <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="2" />
      {off ? <path d="M2.5 13.5l11-11" /> : null}
    </svg>
  )
}

function LockGlyph({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden
    >
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      {open ? <path d="M5.5 7V5a2.5 2.5 0 0 1 4.8-1" /> : <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />}
    </svg>
  )
}
