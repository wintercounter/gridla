import { ThemeSwitch } from '@gridla/demo-kit/react'

import type { SaveStatus } from '../hooks/persistence'

export type Viewport = 'desktop' | 'tablet' | 'mobile'

export const VIEWPORTS: readonly { id: Viewport; label: string; width: number }[] = [
  { id: 'desktop', label: 'Desktop', width: 1200 },
  { id: 'tablet', label: 'Tablet', width: 820 },
  { id: 'mobile', label: 'Mobile', width: 390 },
]

export type ToolbarProps = {
  name: string
  viewport: Viewport
  onViewport: (viewport: Viewport) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  saveStatus: SaveStatus
  savedAt: number | null
  onSave: () => void
  onLoad: () => void
  onClear: () => void
  onExport: () => void
  onImport: () => void
  onShortcuts: () => void
  onHelp: () => void
  debug: boolean
  onToggleDebug: () => void
}

function savedLabel(status: SaveStatus, savedAt: number | null): string {
  switch (status) {
    case 'saved':
      return savedAt
        ? `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : 'Saved'
    case 'saving':
      return 'Saving…'
    case 'unsaved':
      return 'Unsaved changes'
    default:
      return 'Storage unavailable'
  }
}

export function Toolbar(props: ToolbarProps) {
  return (
    <header className="st-toolbar">
      <div className="st-toolbar-group st-toolbar-brand">
        <span className="st-wordmark">Gridla</span>
        <span className="st-toolbar-sep" />
        <span className="st-doc-name" title={props.name}>
          {props.name}
        </span>
      </div>

      <fieldset className="st-toolbar-group" aria-label="Preview width">
        {VIEWPORTS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="st-tool"
            aria-pressed={props.viewport === entry.id}
            onClick={() => props.onViewport(entry.id)}
            title={`${entry.label} · ${entry.width}px`}
          >
            {entry.label}
          </button>
        ))}
      </fieldset>

      <fieldset className="st-toolbar-group" aria-label="History">
        <button
          type="button"
          className="st-tool"
          onClick={props.onUndo}
          disabled={!props.canUndo}
          title="Undo · Ctrl/Cmd + Z"
        >
          Undo
        </button>
        <button
          type="button"
          className="st-tool"
          onClick={props.onRedo}
          disabled={!props.canRedo}
          title="Redo · Shift + Ctrl/Cmd + Z"
        >
          Redo
        </button>
      </fieldset>

      <fieldset className="st-toolbar-group st-toolbar-save" aria-label="Local copy">
        <span className="st-save-status" data-status={props.saveStatus}>
          <span className="st-save-dot" aria-hidden />
          {savedLabel(props.saveStatus, props.savedAt)}
        </span>
        <button
          type="button"
          className="st-tool"
          onClick={props.onSave}
          title="Save to this browser now"
        >
          Save
        </button>
        <button
          type="button"
          className="st-tool"
          onClick={props.onLoad}
          title="Load the saved copy"
        >
          Load
        </button>
        <button
          type="button"
          className="st-tool"
          onClick={props.onClear}
          title="Forget the saved copy"
        >
          Clear
        </button>
      </fieldset>

      <fieldset className="st-toolbar-group" aria-label="Files">
        <button
          type="button"
          className="st-tool"
          onClick={props.onImport}
          title="Paste or open a JSON file"
        >
          Import
        </button>
        <button
          type="button"
          className="st-tool"
          onClick={props.onExport}
          title="Download the layout as JSON"
        >
          Export
        </button>
      </fieldset>

      <div className="st-toolbar-group st-toolbar-end">
        <button
          type="button"
          className="st-tool"
          aria-pressed={props.debug}
          onClick={props.onToggleDebug}
          title="Debug overlay · Ctrl/Cmd + ."
        >
          Debug
        </button>
        <button
          type="button"
          className="st-tool"
          onClick={props.onShortcuts}
          title="Keyboard shortcuts · ?"
        >
          Keys
        </button>
        <button
          type="button"
          className="st-tool"
          onClick={props.onHelp}
          title="How the studio works"
        >
          Help
        </button>
        <ThemeSwitch />
      </div>
    </header>
  )
}
