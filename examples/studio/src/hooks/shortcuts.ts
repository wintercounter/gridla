/**
 * Global keyboard shortcuts. Registered in the capture phase on `window` so
 * they work no matter which canvas or panel has focus; skipped while typing
 * in a form field.
 */

import { useEffect, type RefObject } from 'react'

import { findNode } from '../document'
import { selectionInfo, type StudioAction, type StudioState } from '../store'

export type ShortcutHandlers = {
  stateRef: RefObject<StudioState>
  dispatch: (action: StudioAction) => void
  openShortcuts: () => void
  toggleDebug: () => void
  closeDialog: () => boolean
}

export const SHORTCUTS: readonly { keys: string; action: string }[] = [
  { keys: 'Drag', action: 'Move an item; drop on another canvas to move it there' },
  { keys: 'Shift + drag', action: 'Lock the move to one axis' },
  { keys: 'Ctrl/Cmd + drag', action: 'Skip edge snapping' },
  { keys: 'Shift + click', action: 'Add to or remove from the selection' },
  { keys: 'Arrows', action: 'Nudge the selected item (Shift: ×4, Alt: resize)' },
  { keys: 'Delete / Backspace', action: 'Delete the selection' },
  { keys: 'Ctrl/Cmd + Z', action: 'Undo' },
  { keys: 'Shift + Ctrl/Cmd + Z', action: 'Redo' },
  { keys: 'Ctrl/Cmd + D', action: 'Duplicate the selection' },
  { keys: 'Ctrl/Cmd + L', action: 'Lock or unlock the selection' },
  { keys: 'Ctrl/Cmd + H', action: 'Hide or show the selection' },
  { keys: 'Ctrl/Cmd + A', action: 'Select every item in the active group' },
  { keys: 'Escape', action: 'Cancel a drag, clear the selection, close a dialog' },
  { keys: '?', action: 'This cheat sheet' },
  { keys: 'Ctrl/Cmd + .', action: 'Toggle the debug overlay' },
]

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function useShortcuts({
  stateRef,
  dispatch,
  openShortcuts,
  toggleDebug,
  closeDialog,
}: ShortcutHandlers) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      const editing = isEditable(event.target)

      if (event.key === 'Escape') {
        if (closeDialog()) {
          event.preventDefault()
          return
        }
        if (!editing && !document.documentElement.hasAttribute('data-gridla-dragging')) {
          if (stateRef.current.selection.length > 0) dispatch({ type: 'select', ids: [] })
        }
        return
      }
      if (editing) return

      const selection = stateRef.current.selection
      if (meta && key === 'z') {
        event.preventDefault()
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' })
        return
      }
      if (meta && key === 'y') {
        event.preventDefault()
        dispatch({ type: 'redo' })
        return
      }
      if (meta && key === 'd') {
        event.preventDefault()
        if (selection.length > 0) dispatch({ type: 'duplicate', ids: selection })
        return
      }
      if (meta && key === 'l') {
        event.preventDefault()
        if (selection.length > 0) dispatch({ type: 'toggle-lock', ids: selection })
        return
      }
      if (meta && key === 'h') {
        event.preventDefault()
        if (selection.length > 0) dispatch({ type: 'toggle-hidden', ids: selection })
        return
      }
      if (meta && key === 'a') {
        event.preventDefault()
        const { activeGroupId } = selectionInfo(stateRef.current)
        const group = findNode(stateRef.current.doc.root, activeGroupId)?.node
        const ids = (group?.children ?? []).filter((child) => !child.hidden).map((c) => c.id)
        dispatch({ type: 'select', ids })
        return
      }
      if (meta && key === '.') {
        event.preventDefault()
        toggleDebug()
        return
      }
      if (!meta && event.key === '?') {
        event.preventDefault()
        openShortcuts()
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && !meta) {
        // Canvases handle this themselves when focused; cover the panels.
        const target = event.target instanceof Element ? event.target : null
        if (target?.closest('[data-gridla-canvas]')) return
        if (selection.length > 0) {
          event.preventDefault()
          dispatch({ type: 'remove', ids: selection })
        }
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [stateRef, dispatch, openShortcuts, toggleDebug, closeDialog])
}
