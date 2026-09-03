/**
 * Local persistence in two localStorage keys:
 *
 * - the saved copy (`SAVED_KEY`), written only by the explicit Save action
 *   and restored by Load;
 * - the draft (`DRAFT_KEY`), autosaved after every edit so the page survives
 *   a reload, and cleared whenever the page matches the saved copy.
 *
 * Boot opens the draft when there is one, else the saved copy. Load always
 * goes back to the saved copy, so an autosave that lands between Save and
 * Load can never replace it. Corrupted storage is ignored with a notice.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from 'react'

import { parseDocument, serializeDocument, type StudioDocument } from '../document'
import type { StudioAction } from '../store'

export const SAVED_KEY = 'gridla-studio-saved'
export const DRAFT_KEY = 'gridla-studio-draft'
export const WELCOME_KEY = 'gridla-studio-welcomed'

/** Where the document opened at boot came from. */
export type BootSource = 'draft' | 'saved' | null

export type StoredLoad = {
  /** The document to open, or null when nothing readable is stored. */
  doc: StudioDocument | null
  source: BootSource
  /** The saved copy as stored, so a restored draft can be compared against it. */
  savedRaw: string | null
  /** Set when a key held something unreadable (it has been removed). */
  error: string | null
}

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

type KeyRead = { doc: StudioDocument | null; raw: string | null; error: string | null }

/** Parse one key; unreadable content is removed and reported. */
function readDocumentKey(key: string): KeyRead {
  const raw = readStorage(key)
  if (raw === null) return { doc: null, raw: null, error: null }
  const parsed = parseDocument(raw)
  if (parsed.ok) return { doc: parsed.doc, raw, error: null }
  writeStorage(key, null)
  return { doc: null, raw: null, error: parsed.error }
}

/** Read what the studio should open at boot: the draft, else the saved copy. */
export function loadStoredDocument(): StoredLoad {
  const saved = readDocumentKey(SAVED_KEY)
  const draft = readDocumentKey(DRAFT_KEY)
  const error = draft.error ?? saved.error
  if (draft.doc) return { doc: draft.doc, source: 'draft', savedRaw: saved.raw, error }
  if (saved.doc) return { doc: saved.doc, source: 'saved', savedRaw: saved.raw, error }
  return { doc: null, source: null, savedRaw: null, error }
}

export function hasSeenWelcome(): boolean {
  return readStorage(WELCOME_KEY) === '1'
}

export function markWelcomeSeen() {
  writeStorage(WELCOME_KEY, '1')
}

/**
 * - `saved`: the page matches the saved copy.
 * - `unsaved`: the page differs from the saved copy (the draft keeps it).
 * - `none`: nothing has been saved in this browser.
 * - `unavailable`: localStorage rejected a write.
 */
export type SaveStatus = 'saved' | 'unsaved' | 'none' | 'unavailable'

const AUTOSAVE_DELAY = 700

export function usePersistence(
  doc: StudioDocument,
  dispatch: Dispatch<StudioAction>,
  notify: (message: string, tone?: 'info' | 'ok' | 'error') => void,
  boot: { source: BootSource; savedRaw: string | null },
) {
  const json = useMemo(() => serializeDocument(doc), [doc])
  // The saved copy, serialized, or null when there is none. When boot opened
  // the saved copy itself, the settled page is the reference (serializing it
  // is stable), so the indicator starts at "saved".
  const [savedJson, setSavedJson] = useState<string | null>(() =>
    boot.source === 'saved' ? json : boot.savedRaw,
  )
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  // What storage currently holds for the open page. Nothing is written until
  // the page changes away from it: after Clear the baseline is the open page.
  const baselineRef = useRef<string>(json)
  // The pending autosave. An explicit save, load, or clear cancels it: after
  // Clear a timer scheduled by an earlier edit must not write the page back.
  const timerRef = useRef<number | null>(null)

  const cancelAutosave = useCallback(() => {
    if (timerRef.current === null) return
    window.clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  // Autosave the draft, debounced. A page equal to the saved copy needs no
  // draft, so the draft is dropped instead (undo back to the save, for one).
  useEffect(() => {
    if (json === baselineRef.current) return
    cancelAutosave()
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      const ok = writeStorage(DRAFT_KEY, json === savedJson ? null : json)
      setUnavailable(!ok)
      if (ok) baselineRef.current = json
    }, AUTOSAVE_DELAY)
    return cancelAutosave
  }, [json, savedJson, cancelAutosave])

  const save = useCallback(() => {
    cancelAutosave()
    if (!writeStorage(SAVED_KEY, json)) {
      setUnavailable(true)
      notify('Local storage is unavailable in this browser.', 'error')
      return
    }
    // The draft equals the save at this moment.
    writeStorage(DRAFT_KEY, null)
    baselineRef.current = json
    setSavedJson(json)
    setSavedAt(Date.now())
    setUnavailable(false)
    notify('Saved to this browser.', 'ok')
  }, [json, notify, cancelAutosave])

  const load = useCallback(() => {
    const stored = readDocumentKey(SAVED_KEY)
    if (stored.error) {
      notify(`Stored layout was unreadable and has been cleared (${stored.error}).`, 'error')
      return
    }
    if (!stored.doc || stored.raw === null) {
      notify('Nothing saved in this browser yet.', 'info')
      return
    }
    cancelAutosave()
    writeStorage(DRAFT_KEY, null)
    dispatch({ type: 'replace-document', doc: stored.doc })
    baselineRef.current = stored.raw
    setSavedJson(stored.raw)
    notify(`Loaded "${stored.doc.name}".`, 'ok')
  }, [dispatch, notify, cancelAutosave])

  const clear = useCallback(() => {
    cancelAutosave()
    writeStorage(SAVED_KEY, null)
    writeStorage(DRAFT_KEY, null)
    // The open page becomes the baseline: only a later edit writes a draft.
    baselineRef.current = json
    setSavedJson(null)
    setSavedAt(null)
    notify('Cleared the saved copy and the draft. The page you see is still open.', 'info')
  }, [json, notify, cancelAutosave])

  const status: SaveStatus = unavailable
    ? 'unavailable'
    : savedJson === null
      ? 'none'
      : json === savedJson
        ? 'saved'
        : 'unsaved'

  return { status, savedAt, save, load, clear }
}
