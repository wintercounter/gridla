/**
 * Local persistence: autosave to localStorage with a saved indicator, plus
 * explicit save / load / clear. Corrupted storage is ignored with a notice.
 */

import { useCallback, useEffect, useRef, useState, type Dispatch } from 'react'

import { parseDocument, serializeDocument, type StudioDocument } from '../document'
import type { StudioAction } from '../store'

export const STORAGE_KEY = 'gridla-studio-document'
export const WELCOME_KEY = 'gridla-studio-welcomed'

export type StoredLoad = { doc: StudioDocument | null; error: string | null }

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string | null): boolean {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/** Read the autosaved document. `error` is set when storage held something unreadable. */
export function loadStoredDocument(): StoredLoad {
  const raw = readStorage(STORAGE_KEY)
  if (raw === null) return { doc: null, error: null }
  const parsed = parseDocument(raw)
  if (parsed.ok) return { doc: parsed.doc, error: null }
  writeStorage(STORAGE_KEY, null)
  return { doc: null, error: parsed.error }
}

export function hasSeenWelcome(): boolean {
  return readStorage(WELCOME_KEY) === '1'
}

export function markWelcomeSeen() {
  writeStorage(WELCOME_KEY, '1')
}

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'unavailable'

export function usePersistence(
  doc: StudioDocument,
  dispatch: Dispatch<StudioAction>,
  notify: (message: string, tone?: 'info' | 'ok' | 'error') => void,
) {
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const savedRef = useRef<StudioDocument>(doc)

  const save = useCallback(
    (target: StudioDocument, announce = false) => {
      const ok = writeStorage(STORAGE_KEY, serializeDocument(target))
      if (!ok) {
        setStatus('unavailable')
        if (announce) notify('Local storage is unavailable in this browser.', 'error')
        return
      }
      savedRef.current = target
      setStatus('saved')
      setSavedAt(Date.now())
      if (announce) notify('Saved to this browser.', 'ok')
    },
    [notify],
  )

  // Autosave, debounced.
  useEffect(() => {
    if (doc === savedRef.current) return
    setStatus('unsaved')
    const timer = window.setTimeout(() => {
      setStatus('saving')
      save(doc)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [doc, save])

  const load = useCallback(() => {
    const stored = loadStoredDocument()
    if (stored.error) {
      notify(`Stored layout was unreadable and has been cleared (${stored.error}).`, 'error')
      return
    }
    if (!stored.doc) {
      notify('Nothing saved in this browser yet.', 'info')
      return
    }
    dispatch({ type: 'replace-document', doc: stored.doc })
    savedRef.current = stored.doc
    notify(`Loaded "${stored.doc.name}".`, 'ok')
  }, [dispatch, notify])

  const clear = useCallback(() => {
    writeStorage(STORAGE_KEY, null)
    setSavedAt(null)
    setStatus('unsaved')
    notify('Cleared the saved copy. The page you see is still open.', 'info')
  }, [notify])

  return {
    status,
    savedAt,
    save: () => save(doc, true),
    load,
    clear,
  }
}
