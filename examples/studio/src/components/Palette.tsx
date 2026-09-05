/**
 * Component palette. Click adds to the active group at the first open slot;
 * dragging previews into whichever canvas is under the pointer and commits on
 * release, using the provider's incoming-item preview so the drop looks the
 * same as moving an item between canvases.
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'

import { addAtOpenSlot, addAtPointer, createNode, type NewNode } from '../add'
import { toCanvasPoint, useCanvasRegistry, type CanvasEntry } from '../canvas-registry'
import { findNode } from '../document'
import { KINDS, type NodeKind } from '../registry'
import { selectionInfo, useStudio } from '../store'
import { TEMPLATES, buildTemplate, type TemplateId } from '../templates'
import { useNotices } from './Notices'

const DRAG_THRESHOLD = 6

type DragState = {
  kind: NodeKind
  pointerId: number
  start: { x: number; y: number }
  pending: NewNode | null
  target: CanvasEntry | null
  client: { x: number; y: number }
}

export function Palette({ onTemplate }: { onTemplate: (id: TemplateId) => void }) {
  const { state, dispatch } = useStudio()
  const registry = useCanvasRegistry()
  const { notify } = useNotices()
  const dragRef = useRef<DragState | null>(null)
  const [ghost, setGhost] = useState<{
    kind: NodeKind
    x: number
    y: number
    over: boolean
  } | null>(null)
  const { activeGroupId } = selectionInfo(state)
  const activeGroup = findNode(state.doc.root, activeGroupId)?.node
  const activeLabel =
    activeGroupId === state.doc.root.id
      ? 'the page'
      : `"${String(activeGroup?.props.title ?? 'group')}"`

  const addByClick = useCallback(
    (kind: NodeKind) => {
      const entry = registry.get(activeGroupId) ?? registry.get(state.doc.root.id)
      if (!entry) return
      if (!entry.accepts()) {
        notify('That group is locked. Select another group first.', 'error')
        return
      }
      if (!addAtOpenSlot(entry, kind))
        notify('No room left in that group. Resize it or delete something.', 'error')
    },
    [registry, activeGroupId, state.doc.root.id, notify],
  )

  const cancelDrag = useCallback(() => {
    const drag = dragRef.current
    dragRef.current = null
    drag?.target?.gesture.clearIncoming()
    setGhost(null)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dragRef.current) cancelDrag()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [cancelDrag])

  const onPointerDown = (kind: NodeKind) => (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    dragRef.current = {
      kind,
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      pending: null,
      target: null,
      client: { x: event.clientX, y: event.clientY },
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const client = { x: event.clientX, y: event.clientY }
    drag.client = client
    if (!drag.pending) {
      if (Math.hypot(client.x - drag.start.x, client.y - drag.start.y) < DRAG_THRESHOLD) return
      drag.pending = createNode(drag.kind)
      document.documentElement.setAttribute('data-gridla-dragging', '')
    }
    const target = registry.findAt(client)
    if (drag.target && drag.target !== target) drag.target.gesture.clearIncoming()
    drag.target = target
    let over = false
    if (target) {
      const local = toCanvasPoint(target, client)
      if (local) {
        // Fit the default size into small group canvases.
        const sized = createNode(drag.kind, target).item
        const item = { ...drag.pending.item, w: sized.w, h: sized.h }
        drag.pending = { ...drag.pending, item }
        over = target.gesture.previewIncoming(item, local) !== null
      }
    }
    setGhost({ kind: drag.kind, x: client.x, y: client.y, over })
  }

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    document.documentElement.removeAttribute('data-gridla-dragging')
    setGhost(null)
    if (!drag.pending) {
      addByClick(drag.kind)
      return
    }
    const target = drag.target
    if (!target) return
    const local = toCanvasPoint(target, drag.client)
    if (!local) return
    if (!addAtPointer(target, drag.pending, local)) {
      notify('No room there. Try a larger group or an empty spot.', 'error')
    }
  }

  const onPointerCancel = () => {
    document.documentElement.removeAttribute('data-gridla-dragging')
    cancelDrag()
  }

  return (
    <div className="st-palette">
      <section className="st-panel-section">
        <h2 className="st-panel-title">Blocks</h2>
        <p className="st-panel-hint">
          Click to add to {activeLabel}. Drag onto any canvas to place it exactly.
        </p>
        <ul className="st-palette-list" aria-label="Blocks">
          {KINDS.map((spec) => (
            <li key={spec.kind}>
              <button
                type="button"
                className="st-palette-item"
                title={`${spec.description} Click to add, drag to place.`}
                onPointerDown={onPointerDown(spec.kind)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    addByClick(spec.kind)
                  }
                }}
              >
                <span className="st-palette-icon">{spec.icon}</span>
                <span className="st-palette-label">{spec.label}</span>
                <span className="st-palette-size">
                  {spec.size.w}×{spec.size.h}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="st-panel-section">
        <h2 className="st-panel-title">Templates</h2>
        <ul className="st-template-list" aria-label="Templates">
          {TEMPLATES.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                className="st-template"
                title={template.description}
                onClick={() => {
                  onTemplate(template.id)
                  dispatch({ type: 'replace-document', doc: buildTemplate(template.id) })
                }}
              >
                <span>{template.label}</span>
                <small>{template.description}</small>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {ghost ? (
        <div
          className="st-drag-ghost"
          data-over={ghost.over ? '' : undefined}
          style={{ transform: `translate(${ghost.x + 12}px, ${ghost.y + 12}px)` }}
          aria-hidden
        >
          {KINDS.find((spec) => spec.kind === ghost.kind)?.icon}
          <span>{ghost.over ? 'Drop here' : 'Move over a canvas'}</span>
        </div>
      ) : null}
    </div>
  )
}
