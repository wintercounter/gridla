import { useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'

import type { GridLayout } from 'gridla'
import { GridCanvas, GridProvider, useGridActions, type GridChangeDetail } from 'gridla/react'
import { dashboardLayout } from '@gridla/demo-kit'
import {
  Button,
  ControlGroup,
  DemoFrame,
  DemoItem,
  DemoPreview,
  Inspector,
  RangeField,
} from '@gridla/demo-kit/react'

import { CodeExample } from '../lib/code'
import { useHashState } from '../lib/hash-state'

const SNIPPET = `import { GridCanvas, GridProvider } from 'gridla/react'

// GridCanvas wires pointer + keyboard for you. Modifier behavior is built in:
//   Shift while dragging   -> lock to the dominant axis
//   Ctrl / Cmd while dragging -> bypass alignment snapping
//   Arrow keys             -> nudge the selected item by keyboardStep (Shift ×4)
//   Alt + arrows           -> resize from the bottom-right corner
//   Escape                 -> cancel the gesture; Delete/Backspace -> onDeleteKey
<GridProvider layout={layout} onLayoutChange={setLayout} keyboardStep={8} dragThreshold={4}>
  <GridCanvas onDeleteKey={(id) => actions.remove(id)} onItemClick={(id) => console.log('click', id)} />
</GridProvider>`

type Data = { label: string }
type Input = { source: string; detail: string; modifiers: string }

const DEFAULTS = { keyboardStep: 8, dragThreshold: 4 }

function modifiers(event: {
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}) {
  const list = [
    event.shiftKey && 'Shift',
    event.ctrlKey && 'Ctrl',
    event.metaKey && 'Cmd',
    event.altKey && 'Alt',
  ].filter(Boolean)
  return list.length > 0 ? list.join(' + ') : 'none'
}

function DeleteWiring({
  children,
  onInput,
}: {
  children: ReactNode
  onInput: (input: Input) => void
}) {
  const actions = useGridActions<Data>()
  return (
    <GridCanvas
      aria-label="Interactive dashboard for pointer, touch, and keyboard input"
      style={{ minHeight: '100%' }}
      onDeleteKey={(id) => {
        actions.remove(id)
        onInput({ source: 'keyboard', detail: `Delete → removed ${id}`, modifiers: 'none' })
      }}
      onItemClick={(id) =>
        onInput({ source: 'pointer', detail: `click → selected ${id}`, modifiers: 'none' })
      }
    >
      {children}
    </GridCanvas>
  )
}

export function ReactInputDemo() {
  const [state, update, reset] = useHashState(DEFAULTS)
  const initial = useMemo(() => dashboardLayout(12), [])
  const [layout, setLayout] = useState<GridLayout<Data>>(initial)
  const [last, setLast] = useState<Input>({
    source: '—',
    detail: 'Interact with the canvas',
    modifiers: 'none',
  })
  const [commit, setCommit] = useState<string>('—')

  const onPointer = (event: PointerEvent<HTMLDivElement>) => {
    setLast({
      source: event.pointerType || 'pointer',
      detail: `${event.type} at ${Math.round(event.clientX)},${Math.round(event.clientY)}`,
      modifiers: modifiers(event),
    })
  }
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const name = event.key === ' ' ? 'Space' : event.key
    const meaning = name.startsWith('Arrow')
      ? event.altKey
        ? 'resize'
        : event.shiftKey
          ? 'nudge ×4'
          : 'nudge'
      : name === 'Escape'
        ? 'cancel gesture'
        : name === 'Delete' || name === 'Backspace'
          ? 'delete selected'
          : name === 'Tab'
            ? 'focus'
            : 'no binding'
    setLast({ source: 'keyboard', detail: `${name} → ${meaning}`, modifiers: modifiers(event) })
  }

  return (
    <GridProvider<Data>
      layout={layout}
      onLayoutChange={setLayout}
      gap={12}
      keyboardStep={state.keyboardStep}
      dragThreshold={state.dragThreshold}
      onCommit={(detail: GridChangeDetail) =>
        setCommit(`${detail.reason} · ${detail.strategy ?? '—'}`)
      }
    >
      <DemoFrame
        stageLabel="click to select · then use the keyboard"
        stageStyle={{ height: 480 }}
        stage={
          <div
            onPointerDownCapture={onPointer}
            onPointerMoveCapture={(e) => {
              if (e.buttons) onPointer(e)
            }}
            onKeyDownCapture={onKey}
            style={{ height: '100%' }}
          >
            <DeleteWiring onInput={setLast}>
              {layout.items.map((item) => (
                <DemoItem key={item.id} id={item.id} label={item.data?.label}>
                  {item.id === 'header'
                    ? 'Shift locks an axis · Ctrl bypasses snap'
                    : 'arrows nudge · Alt+arrows resize'}
                </DemoItem>
              ))}
              <DemoPreview />
            </DeleteWiring>
          </div>
        }
        controls={
          <>
            <ControlGroup title="Last input">
              <dl className="gl-readout" aria-live="polite">
                <dt>source</dt>
                <dd data-accent>{last.source}</dd>
                <dt>event</dt>
                <dd>{last.detail}</dd>
                <dt>modifiers</dt>
                <dd>{last.modifiers}</dd>
                <dt>last commit</dt>
                <dd>{commit}</dd>
              </dl>
            </ControlGroup>
            <ControlGroup title="Legend">
              <ul className="gl-legend">
                <li>
                  <kbd>drag</kbd> move · edges resize (mouse, pen, touch)
                </li>
                <li>
                  <kbd>Shift</kbd> + drag: lock to the dominant axis
                </li>
                <li>
                  <kbd>Ctrl</kbd> / <kbd>Cmd</kbd> + drag: bypass snapping
                </li>
                <li>
                  <kbd>←↑→↓</kbd> nudge selected by {state.keyboardStep}px
                </li>
                <li>
                  <kbd>Shift</kbd> + arrows: nudge ×4
                </li>
                <li>
                  <kbd>Alt</kbd> + arrows: resize from the corner
                </li>
                <li>
                  <kbd>Esc</kbd> cancel the gesture
                </li>
                <li>
                  <kbd>Delete</kbd> remove the selected item
                </li>
              </ul>
            </ControlGroup>
            <ControlGroup title="Provider props">
              <RangeField
                label="keyboardStep"
                value={state.keyboardStep}
                min={1}
                max={32}
                step={1}
                onChange={(keyboardStep) => update({ keyboardStep })}
                format={(v) => `${v}px`}
              />
              <RangeField
                label="dragThreshold"
                value={state.dragThreshold}
                min={0}
                max={24}
                step={1}
                onChange={(dragThreshold) => update({ dragThreshold })}
                format={(v) => `${v}px`}
              />
            </ControlGroup>
            <div className="gd-actions">
              <Button
                onClick={() => {
                  reset()
                  setLayout(initial)
                }}
              >
                Reset
              </Button>
            </div>
          </>
        }
        inspector={
          <>
            <Inspector />
            <CodeExample code={SNIPPET} />
          </>
        }
      />
    </GridProvider>
  )
}
