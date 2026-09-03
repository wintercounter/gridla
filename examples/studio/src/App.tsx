/**
 * The studio shell: palette left, canvas center, layers and inspector right.
 * Below ~900px the panels stack and a tab bar picks one.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'

import { GridTransferScope } from 'gridla/react'

import { CanvasRegistryContext, createCanvasRegistry } from './canvas-registry'
import { DebugOverlay } from './components/DebugOverlay'
import {
  ExportDialog,
  ImportDialog,
  ShortcutsDialog,
  TemplatesDialog,
  WelcomeDialog,
  type DialogKind,
} from './components/Dialogs'
import { Inspector } from './components/Inspector'
import { Layers } from './components/Layers'
import { NoticesProvider, useNotices } from './components/Notices'
import { Palette } from './components/Palette'
import { GroupCanvas } from './components/StudioCanvas'
import { Toolbar, VIEWPORTS, type Viewport } from './components/Toolbar'
import { countNodes, createDocument, type StudioDocument } from './document'
import {
  hasSeenWelcome,
  loadStoredDocument,
  markWelcomeSeen,
  usePersistence,
} from './hooks/persistence'
import { useShortcuts } from './hooks/shortcuts'
import { StudioContext, initialState, studioReducer } from './store'
import { buildTemplate, type TemplateId } from './templates'

type Tab = 'canvas' | 'add' | 'inspect' | 'layers'

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'add', label: 'Add' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'inspect', label: 'Inspect' },
  { id: 'layers', label: 'Layers' },
]

function Studio({
  initial,
  storageError,
}: {
  initial: StudioDocument
  storageError: string | null
}) {
  const [state, dispatch] = useReducer(studioReducer, initial, initialState)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  })
  const { notify } = useNotices()
  const [registry] = useState(createCanvasRegistry)

  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [dialog, setDialog] = useState<DialogKind | null>(() =>
    hasSeenWelcome() ? null : 'welcome',
  )
  const [debug, setDebug] = useState(false)
  const [tab, setTab] = useState<Tab>('canvas')

  const persistence = usePersistence(state.doc, dispatch, notify)

  useEffect(() => {
    if (storageError) {
      notify(`Ignored an unreadable saved layout (${storageError}). Starting fresh.`, 'error')
    }
  }, [storageError, notify])

  const closeDialog = useCallback(() => {
    if (!dialog) return false
    if (dialog === 'welcome') markWelcomeSeen()
    setDialog(null)
    return true
  }, [dialog])

  const openTemplate = useCallback(
    (id: TemplateId) => {
      const doc = buildTemplate(id)
      dispatch({ type: 'replace-document', doc })
      notify(
        `Loaded the ${doc.name.toLowerCase()} template (${countNodes(doc.root)} nodes). Undo to go back.`,
        'ok',
      )
      setTab('canvas')
    },
    [notify],
  )

  useShortcuts({
    stateRef,
    dispatch,
    openShortcuts: useCallback(() => setDialog('shortcuts'), []),
    toggleDebug: useCallback(() => setDebug((value) => !value), []),
    closeDialog,
  })

  const contextValue = useMemo(() => ({ state, dispatch }), [state])
  const width = VIEWPORTS.find((entry) => entry.id === viewport)?.width ?? 1200

  return (
    <StudioContext.Provider value={contextValue}>
      <CanvasRegistryContext.Provider value={registry}>
        <div className="st-app" data-tab={tab} data-debug={debug ? '' : undefined}>
          <Toolbar
            name={state.doc.name}
            viewport={viewport}
            onViewport={setViewport}
            canUndo={state.past.length > 0}
            canRedo={state.future.length > 0}
            onUndo={() => dispatch({ type: 'undo' })}
            onRedo={() => dispatch({ type: 'redo' })}
            saveStatus={persistence.status}
            savedAt={persistence.savedAt}
            onSave={persistence.save}
            onLoad={persistence.load}
            onClear={persistence.clear}
            onExport={() => setDialog('export')}
            onImport={() => setDialog('import')}
            onShortcuts={() => setDialog('shortcuts')}
            onHelp={() => setDialog('welcome')}
            debug={debug}
            onToggleDebug={() => setDebug((value) => !value)}
          />

          <aside className="st-side st-side-left" data-panel="add" aria-label="Palette">
            <Palette onTemplate={() => setTab('canvas')} />
          </aside>

          <main className="st-stage" data-panel="canvas" data-viewport={viewport}>
            <div className="st-stage-scroll">
              <div className="st-page" style={{ maxWidth: width }}>
                <span className="st-page-label">
                  {viewport} · {width}px
                </span>
                <GridTransferScope>
                  <GroupCanvas
                    groupId={state.doc.root.id}
                    root
                    onTemplates={() => setDialog('templates')}
                  />
                </GridTransferScope>
              </div>
            </div>
            {debug ? <DebugOverlay /> : null}
          </main>

          <aside className="st-side st-side-right" aria-label="Inspector and layers">
            <div className="st-side-panel" data-panel="layers">
              <Layers />
            </div>
            <div className="st-side-panel" data-panel="inspect">
              <Inspector />
            </div>
          </aside>

          <nav className="st-tabs" aria-label="Panels">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="st-tab"
                aria-pressed={tab === entry.id}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </nav>
        </div>

        {dialog === 'welcome' ? (
          <WelcomeDialog onClose={closeDialog} onTemplate={openTemplate} />
        ) : null}
        {dialog === 'shortcuts' ? <ShortcutsDialog onClose={closeDialog} /> : null}
        {dialog === 'templates' ? (
          <TemplatesDialog onClose={closeDialog} onPick={openTemplate} />
        ) : null}
        {dialog === 'export' ? <ExportDialog onClose={closeDialog} doc={state.doc} /> : null}
        {dialog === 'import' ? (
          <ImportDialog
            onClose={closeDialog}
            onImport={(doc) => {
              dispatch({ type: 'replace-document', doc })
              notify(`Imported "${doc.name}" with ${countNodes(doc.root)} nodes.`, 'ok')
            }}
          />
        ) : null}
      </CanvasRegistryContext.Provider>
    </StudioContext.Provider>
  )
}

export function App() {
  const [boot] = useState(() => {
    const stored = loadStoredDocument()
    return { doc: stored.doc ?? createDocument(), error: stored.error }
  })
  return (
    <NoticesProvider>
      <Studio initial={boot.doc} storageError={boot.error} />
    </NoticesProvider>
  )
}
