/**
 * Modal dialogs: welcome, shortcuts, import, export, templates. One generic
 * frame with focus handling; Escape closes through the global shortcuts.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'

import { parseDocument, serializeDocument, type StudioDocument } from '../document'
import { SHORTCUTS } from '../hooks/shortcuts'
import { TEMPLATES, type TemplateId } from '../templates'

export type DialogKind = 'welcome' | 'shortcuts' | 'import' | 'export' | 'templates'

function Dialog({
  title,
  onClose,
  children,
  wide,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement | null>(null)
  const restore = useRef<HTMLElement | null>(null)
  useEffect(() => {
    restore.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const first = ref.current?.querySelector<HTMLElement>(
      '[data-autofocus], button, textarea, input, [tabindex="0"]',
    )
    first?.focus()
    return () => restore.current?.focus()
  }, [])
  return (
    <div className="st-scrim">
      <dialog
        ref={ref}
        open
        className="st-dialog"
        data-wide={wide ? '' : undefined}
        aria-modal="true"
        aria-labelledby="st-dialog-title"
      >
        <div className="st-dialog-head">
          <h2 id="st-dialog-title">{title}</h2>
          <button type="button" className="st-icon-button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="st-dialog-body">{children}</div>
      </dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------

export function WelcomeDialog({
  onClose,
  onTemplate,
}: {
  onClose: () => void
  onTemplate: (id: TemplateId) => void
}) {
  return (
    <Dialog title="Build a page with Gridla" onClose={onClose}>
      <ol className="st-steps">
        <li>
          <strong>Add blocks.</strong> Drag any block from the palette onto the canvas, or click it
          to drop it into the first open spot.
        </li>
        <li>
          <strong>Arrange them.</strong> Drag to move, pull the edges to resize. Neighbors make
          room. Put blocks into a group and resize the group to reflow them together.
        </li>
        <li>
          <strong>Keep it.</strong> The page saves itself in this browser. Export JSON to share, and
          switch between desktop, tablet and mobile widths at any time.
        </li>
      </ol>
      <div className="st-button-row">
        <button
          type="button"
          className="st-button"
          data-variant="primary"
          data-autofocus
          onClick={onClose}
        >
          Start with a blank page
        </button>
        <button
          type="button"
          className="st-button"
          onClick={() => {
            onTemplate('dashboard')
            onClose()
          }}
        >
          Open the dashboard template
        </button>
      </div>
      <p className="st-panel-hint">
        Press <kbd>?</kbd> at any time for the keyboard shortcuts.
      </p>
    </Dialog>
  )
}

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard and pointer" onClose={onClose}>
      <table className="st-shortcuts">
        <tbody>
          {SHORTCUTS.map((entry) => (
            <tr key={entry.keys}>
              <td>
                <kbd>{entry.keys}</kbd>
              </td>
              <td>{entry.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  )
}

export function TemplatesDialog({
  onClose,
  onPick,
}: {
  onClose: () => void
  onPick: (id: TemplateId) => void
}) {
  return (
    <Dialog title="Start from a template" onClose={onClose}>
      <ul className="st-template-list">
        {TEMPLATES.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              className="st-template"
              onClick={() => {
                onPick(template.id)
                onClose()
              }}
            >
              <span>{template.label}</span>
              <small>{template.description}</small>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}

export function ExportDialog({ onClose, doc }: { onClose: () => void; doc: StudioDocument }) {
  const json = serializeDocument(doc)
  const [copied, setCopied] = useState(false)
  const download = () => {
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${doc.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'layout'}.gridla.json`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <Dialog title="Export layout" onClose={onClose} wide>
      <p className="st-panel-hint">
        The whole document: the tree of nodes with each group's layout. Paste it back with Import.
      </p>
      <div className="st-button-row">
        <button
          type="button"
          className="st-button"
          data-variant="primary"
          data-autofocus
          onClick={download}
        >
          Download JSON
        </button>
        <button type="button" className="st-button" onClick={copy}>
          {copied ? 'Copied' : 'Copy to clipboard'}
        </button>
      </div>
      <textarea
        className="st-input st-textarea st-json"
        readOnly
        value={json}
        rows={14}
        aria-label="Layout JSON"
      />
    </Dialog>
  )
}

export function ImportDialog({
  onClose,
  onImport,
}: {
  onClose: () => void
  onImport: (doc: StudioDocument) => void
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = () => {
    const result = parseDocument(text)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onImport(result.doc)
    onClose()
  }
  const pickFile = async (file: File | undefined) => {
    if (!file) return
    setText(await file.text())
    setError(null)
  }
  return (
    <Dialog title="Import layout" onClose={onClose} wide>
      <p className="st-panel-hint">
        Paste JSON exported from this studio, or open a file. The current page is replaced; undo
        brings it back.
      </p>
      <textarea
        className="st-input st-textarea st-json"
        data-autofocus
        rows={12}
        value={text}
        placeholder='{ "format": "gridla-studio", "version": 1, ... }'
        aria-label="Layout JSON"
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          setText(event.target.value)
          setError(null)
        }}
      />
      {error ? (
        <p className="st-error" role="alert">
          Could not import: {error}
        </p>
      ) : null}
      <div className="st-button-row">
        <button
          type="button"
          className="st-button"
          data-variant="primary"
          onClick={submit}
          disabled={!text.trim()}
        >
          Import
        </button>
        <label className="st-button st-file">
          Open file…
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => void pickFile(event.target.files?.[0])}
          />
        </label>
      </div>
    </Dialog>
  )
}
