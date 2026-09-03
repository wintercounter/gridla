import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'

import {
  createItem,
  flattenLayout,
  type FlatItem,
  type GridItem as GridItemModel,
  type GridLayout,
  type GridNode,
} from 'gridla'
import {
  applyMeasuredSize,
  GridCanvas,
  GridItem,
  GridProvider,
  GridTransferScope,
  useGridContext,
  useGridLayout,
} from 'gridla/react'
import { canvas, formatRect } from '@gridla/demo-kit'
import {
  Button,
  ControlGroup,
  DemoFrame,
  DemoPreview,
  RangeField,
  SelectField,
  StatGrid,
  Toggle,
} from '@gridla/demo-kit/react'

import { CodeExample } from '../lib/code'
import { CoreInspector } from '../lib/core-inspector'
import { useHashState } from '../lib/hash-state'

const SNIPPET = `import { flattenLayout } from 'gridla'
import { GridProvider, GridCanvas, GridItem, GridTransferScope } from 'gridla/react'

// A group is an item of the root canvas that hosts its own provider. The
// scope lets tiles move between the root and any group.
<GridTransferScope>
  <GridProvider layout={root} onLayoutChange={setRoot} gap={16}>
    <GridCanvas>
      <GridItem id="group-a" draggable={false}>
        {({ dragHandleProps }) => (
          <>
            <header {...dragHandleProps}>Group A</header>
            <GridProvider layout={groupA} onLayoutChange={setGroupA} gap={12} acceptTransfers={!locked}>
              <GridCanvas onPointerDown={(e) => e.stopPropagation()}>
                {groupA.items.map((item) => <GridItem key={item.id} id={item.id} />)}
              </GridCanvas>
            </GridProvider>
          </>
        )}
      </GridItem>
    </GridCanvas>
  </GridProvider>
</GridTransferScope>

// The same tree as data: every node gets a rect in ROOT pixels plus the
// canonical rect it was authored with inside its parent.
const flat = flattenLayout(tree, { x: 0, y: 0, w: 960, h: 600 })
flat.itemsById.get('card-1')?.rect          // root coordinates
flat.itemsById.get('card-1')?.canonicalRect // as authored inside group-a's 480×300 layout`

type Data = { label: string }
type GroupId = 'group-a' | 'group-b'
type Layouts = { root: GridLayout<Data>; 'group-a': GridLayout<Data>; 'group-b': GridLayout<Data> }
type LogLine = { seq: number; line: string; tone?: 'warn' }

const GROUP_GAP: Record<GroupId, number> = { 'group-a': 12, 'group-b': 5 }
const isGroup = (id: string): id is GroupId => id === 'group-a' || id === 'group-b'

const DEFAULTS = { height: 480, lockB: false, item: '' }

function build(): Layouts {
  return {
    root: {
      canvas: canvas(960, 600, 16),
      items: [
        createItem('group-a', { w: 560, h: 300, minW: 220, minH: 160 }, 16, 16, {
          label: 'Group A',
        }),
        createItem('panel', { w: 352, h: 300, minW: 120, minH: 120 }, 592, 16, {
          label: 'Panel',
        }),
        createItem('group-b', { w: 928, h: 252, minW: 220, minH: 140 }, 16, 332, {
          label: 'Group B',
        }),
      ],
    },
    // Authored at 480×300: the group renders it at 560×300 and projects.
    'group-a': {
      canvas: canvas(480, 300, 12),
      items: [
        createItem('card-1', { w: 222, h: 276, minW: 60, minH: 60 }, 12, 12, { label: 'Card 1' }),
        createItem('card-2', { w: 222, h: 132, minW: 60, minH: 60 }, 246, 12, { label: 'Card 2' }),
        createItem('card-3', { w: 222, h: 132, minW: 60, minH: 60 }, 246, 156, {
          label: 'Card 3',
        }),
      ],
    },
    // Authored at 600×200 for a 928×252 item: a different scale on each axis.
    // The third slot stays free so a tile from group A has room to land.
    'group-b': {
      canvas: canvas(600, 200, 10),
      items: [
        createItem('note-1', { w: 190, h: 180, minW: 40, minH: 40 }, 10, 10, { label: 'Note 1' }),
        createItem('note-2', { w: 190, h: 180, minW: 40, minH: 40 }, 205, 10, { label: 'Note 2' }),
      ],
    },
  }
}

const lock = (item: GridItemModel<Data>): GridItemModel<Data> => ({
  ...item,
  policy: { ...item.policy, movement: 'locked' },
})

/** Drop the lock policy again: the toggle, not the layout, owns it here. */
function unlock(layout: GridLayout<Data>): GridLayout<Data> {
  return {
    ...layout,
    items: layout.items.map((item) =>
      item.policy?.movement === 'locked' ? { ...item, policy: undefined } : item,
    ),
  }
}

/** Locking the subtree pins group B in the root and every tile inside it. */
function withLock(layouts: Layouts, lockB: boolean): Layouts {
  if (!lockB) return layouts
  return {
    root: {
      ...layouts.root,
      items: layouts.root.items.map((item) => (item.id === 'group-b' ? lock(item) : item)),
    },
    'group-a': layouts['group-a'],
    'group-b': { ...layouts['group-b'], items: layouts['group-b'].items.map(lock) },
  }
}

/** The tree `flattenLayout` sees: the rendered root plus each group's authored layout. */
function toTree(layouts: Layouts, rendered: GridLayout<Data>, lockB: boolean): GridNode<Data> {
  const node = (item: GridItemModel<Data>): GridNode<Data> => {
    if (!isGroup(item.id)) return { id: item.id, data: item.data }
    const layout = layouts[item.id]
    return {
      id: item.id,
      layout,
      gap: GROUP_GAP[item.id],
      behavior: { locked: lockB && item.id === 'group-b' },
      data: item.data,
      children: layout.items.map(node),
    }
  }
  return {
    id: 'root',
    layout: rendered,
    data: { label: 'Root' },
    children: rendered.items.map(node),
  }
}

function stop(event: { stopPropagation: () => void }) {
  event.stopPropagation()
}

/**
 * Measure the canvas before paint, so a nested canvas takes its group's
 * projected size in the same flush instead of one frame later.
 */
function SyncMeasure({ canvasRef }: { canvasRef: RefObject<HTMLDivElement | null> }) {
  const { store, config } = useGridContext()
  useLayoutEffect(() => {
    const element = canvasRef.current
    if (!element || !config.responsive) return
    const rect = element.getBoundingClientRect()
    const size = { w: Math.round(rect.width), h: Math.round(rect.height) }
    if (size.w <= 0 || size.h <= 0) return
    applyMeasuredSize(store, size, config)
  })
  return null
}

/** Remember which provider id belongs to which named canvas, for the log. */
function NameTag({ name, names }: { name: string; names: RefObject<Map<string, string>> }) {
  const { id } = useGridContext()
  useEffect(() => {
    names.current?.set(id, name)
  }, [id, name, names])
  return null
}

function LockBadge({ tone }: { tone?: 'warn' }) {
  return (
    <span className="gx-lock" data-tone={tone}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <rect x="3" y="7" width="10" height="7" rx="1.5" />
        <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
      </svg>
      locked
    </span>
  )
}

function Tile({
  item,
  locked,
  onHover,
}: {
  item: GridItemModel<Data>
  locked: boolean
  onHover: (id: string) => void
}) {
  return (
    <GridItem
      id={item.id}
      className="gd-item"
      draggable={!locked}
      resizeEdges={locked ? [] : ['e', 's', 'se']}
      resizeHandleClassName="gd-handle"
      data-locked={locked ? '' : undefined}
      onPointerOver={(event: ReactPointerEvent<HTMLDivElement>) => {
        event.stopPropagation()
        onHover(item.id)
      }}
    >
      {(view) => (
        <>
          <div className="gd-item-head">
            <span>{item.data?.label ?? item.id}</span>
            <span className="gd-item-coords">{formatRect(view.rect)}</span>
          </div>
          <div className="gd-item-body gx-tile-body">
            {locked ? <LockBadge /> : 'drag within the group or into another one'}
          </div>
        </>
      )}
    </GridItem>
  )
}

function Group({
  item,
  layout,
  locked,
  refused,
  names,
  onChange,
  onHover,
  onPick,
  onLog,
}: {
  item: GridItemModel<Data>
  layout: GridLayout<Data>
  locked: boolean
  refused: boolean
  names: RefObject<Map<string, string>>
  onChange: (id: GroupId, layout: GridLayout<Data>) => void
  onHover: (id: string) => void
  onPick: (id: string) => void
  onLog: (line: string) => void
}) {
  const id = item.id as GroupId
  const label = item.data?.label ?? id
  const canvasRef = useRef<HTMLDivElement | null>(null)
  return (
    <GridItem
      id={id}
      className="gd-item"
      draggable={false}
      resizeEdges={locked ? [] : ['e', 's', 'se']}
      resizeHandleClassName="gd-handle"
      data-locked={locked ? '' : undefined}
      style={{ padding: 0, overflow: 'hidden' }}
      onPointerOver={(event: ReactPointerEvent<HTMLDivElement>) => {
        event.stopPropagation()
        onHover(id)
      }}
    >
      {(view) => (
        <div
          className="gx-group"
          data-locked={locked ? '' : undefined}
          data-refused={refused ? '' : undefined}
        >
          <div
            className="gx-group-head"
            data-static={locked ? '' : undefined}
            title={locked ? 'Locked group' : 'Drag to move the group'}
            {...(locked ? {} : view.dragHandleProps)}
          >
            <span>{label}</span>
            <span className="gx-group-meta">
              {layout.items.length} items · {formatRect(view.rect)}
            </span>
            {locked ? <LockBadge tone={refused ? 'warn' : undefined} /> : null}
          </div>
          <div
            className="gx-group-body"
            role="presentation"
            onPointerDown={stop}
            onClick={stop}
            onKeyDown={stop}
          >
            <GridProvider<Data>
              layout={layout}
              onLayoutChange={(next) => onChange(id, next)}
              gap={GROUP_GAP[id]}
              acceptTransfers={(incoming) => !locked && !isGroup(incoming.id)}
              onTransferIn={(incoming, sourceId) =>
                onLog(`${incoming.id}: ${names.current?.get(sourceId) ?? sourceId} to ${label}`)
              }
            >
              <NameTag name={label} names={names} />
              <SyncMeasure canvasRef={canvasRef} />
              <GridCanvas
                ref={canvasRef}
                aria-label={`${label} canvas`}
                style={{ height: '100%' }}
                onItemClick={onPick}
              >
                {layout.items.map((child) => (
                  <Tile key={child.id} item={child} locked={locked} onHover={onHover} />
                ))}
                <DemoPreview />
              </GridCanvas>
            </GridProvider>
          </div>
        </div>
      )}
    </GridItem>
  )
}

/** Everything under the root provider: the stage, the controls, the inspector. */
function Stage({
  layouts,
  shown,
  lockB,
  height,
  inspected,
  log,
  refused,
  names,
  onHover,
  onPick,
  onChange,
  onLog,
  onLock,
  onHeight,
  onInspect,
  onReset,
}: {
  layouts: Layouts
  shown: Layouts
  lockB: boolean
  height: number
  inspected: string
  log: LogLine[]
  refused: boolean
  names: RefObject<Map<string, string>>
  onHover: (id: string | null) => void
  onPick: (id: string) => void
  onChange: (id: keyof Layouts, layout: GridLayout<Data>) => void
  onLog: (line: string) => void
  onLock: (lockB: boolean) => void
  onHeight: (height: number) => void
  onInspect: (id: string) => void
  onReset: () => void
}) {
  const rendered = useGridLayout<Data>()
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const tree = useMemo(() => toTree(layouts, rendered, lockB), [layouts, rendered, lockB])
  const rootRect = useMemo(
    () => ({ x: 0, y: 0, w: rendered.canvas.width, h: rendered.canvas.height }),
    [rendered.canvas.width, rendered.canvas.height],
  )
  const flat = useMemo(() => flattenLayout(tree, rootRect), [tree, rootRect])
  const target: FlatItem<GridNode<Data>> | undefined = flat.itemsById.get(inspected)
  const refusals = log.filter((entry) => entry.tone === 'warn').length

  return (
    <DemoFrame
      stageLabel={`root ${Math.round(rendered.canvas.width)}×${Math.round(rendered.canvas.height)} · hover to inspect · drag tiles between groups`}
      stageStyle={{ height }}
      stage={
        <>
          <SyncMeasure canvasRef={canvasRef} />
          <GridCanvas
            ref={canvasRef}
            aria-label="Root canvas with two nested groups; drag tiles within and between them"
            style={{ height: '100%' }}
            onItemClick={onPick}
            onPointerLeave={() => onHover(null)}
          >
            {shown.root.items.map((item) =>
              isGroup(item.id) ? (
                <Group
                  key={item.id}
                  item={item}
                  layout={shown[item.id]}
                  locked={lockB && item.id === 'group-b'}
                  refused={refused && item.id === 'group-b'}
                  names={names}
                  onChange={onChange}
                  onHover={onHover}
                  onPick={onPick}
                  onLog={onLog}
                />
              ) : (
                <Tile key={item.id} item={item} locked={false} onHover={onHover} />
              ),
            )}
            <DemoPreview />
          </GridCanvas>
        </>
      }
      controls={
        <>
          <ControlGroup title="Stage">
            <RangeField
              label="Stage height"
              value={height}
              min={360}
              max={720}
              step={20}
              onChange={onHeight}
              format={(v) => `${v}px`}
            />
          </ControlGroup>
          <ControlGroup title="Tree">
            <Toggle label="Lock group B subtree" checked={lockB} onChange={onLock} />
            <SelectField
              label="Inspect (keyboard)"
              value={inspected && flat.itemsById.has(inspected) ? inspected : ''}
              options={[
                { value: '', label: '— none —' },
                ...flat.items
                  .filter((entry) => entry.depth > 0)
                  .map((entry) => ({
                    value: entry.id,
                    label: `${'· '.repeat(entry.depth - 1)}${entry.id}`,
                  })),
              ]}
              onChange={onInspect}
            />
          </ControlGroup>
          <ControlGroup title="Transfer log">
            <ol className="gl-legend" aria-live="polite">
              {log.length === 0 ? <li>No transfers yet. Drag a card into group B.</li> : null}
              {log.map((entry) => (
                <li key={entry.seq}>
                  {entry.tone === 'warn' ? <b className="gl-rejected-tag">refused</b> : null}{' '}
                  {entry.line}
                </li>
              ))}
            </ol>
          </ControlGroup>
          <div className="gd-actions">
            <Button onClick={onReset}>Reset</Button>
          </div>
        </>
      }
      inspector={
        <>
          <div className="gd-inspector">
            <div className="gd-inspector-bar">
              <span>
                nodes <b>{flat.items.length}</b>
              </span>
              <span>
                inspecting <b data-strategy>{target?.id ?? '—'}</b>
              </span>
              <span>
                transfers <b>{log.length - refusals}</b>
              </span>
              <span>
                refused <b>{refusals}</b>
              </span>
            </div>
            <StatGrid
              ariaLabel="Coordinates of the inspected node"
              stats={[
                { label: 'parent', value: target?.parentId ?? '—' },
                { label: 'depth', value: target?.depth ?? '—' },
                {
                  label: 'root rect',
                  value: target ? formatRect(target.rect) : '—',
                  tone: 'accent',
                  detail: 'root pixels',
                },
                {
                  label: 'canonical rect',
                  value: target?.canonicalRect ? formatRect(target.canonicalRect) : '—',
                  detail: 'as authored in the parent',
                },
                {
                  label: 'rendered in parent',
                  value: target?.sizing ? formatRect(target.sizing) : '—',
                },
                {
                  label: 'flags',
                  value: target
                    ? [
                        target.isContainer && 'container',
                        target.acceptsChildren && 'accepts children',
                        target.locked && 'locked',
                        target.contained && 'contained',
                      ]
                        .filter(Boolean)
                        .join(', ') || 'leaf'
                    : '—',
                },
                { label: 'gap', value: target?.gap ?? '—' },
              ]}
            />
          </div>
          <CoreInspector layout={rendered} title="Root layout (rendered pixels)" />
          <CoreInspector layout={layouts['group-a']} title="Group A layout (authored 480×300)" />
          <CoreInspector layout={layouts['group-b']} title="Group B layout (authored 600×200)" />
          <CodeExample code={SNIPPET} />
        </>
      }
    />
  )
}

export function NestedGroupsDemo() {
  const [state, update, reset] = useHashState(DEFAULTS)
  const [layouts, setLayouts] = useState<Layouts>(build)
  const [hovered, setHovered] = useState<string | null>(null)
  const [log, setLog] = useState<LogLine[]>([])
  const [refused, setRefused] = useState(false)
  const seq = useRef(0)
  const names = useRef(new Map<string, string>())
  const stageRef = useRef<HTMLDivElement | null>(null)
  const shown = useMemo(() => withLock(layouts, state.lockB), [layouts, state.lockB])

  const push = useCallback(
    (line: string, tone?: 'warn') =>
      setLog((list) => [{ seq: (seq.current += 1), line, tone }, ...list].slice(0, 6)),
    [],
  )
  const onChange = (id: keyof Layouts, layout: GridLayout<Data>) =>
    setLayouts((current) => ({ ...current, [id]: unlock(layout) }))

  // A locked group B never previews a drop, so the scope shows nothing. Watch
  // the pointer during a drag and flag the refusal while it hovers the group.
  useEffect(() => {
    if (!state.lockB) return
    let over = false
    let flashTimer: number | null = null
    const groupB = () =>
      stageRef.current?.querySelector<HTMLElement>('[data-gridla-item="group-b"]') ?? null
    const inside = (event: PointerEvent) => {
      const rect = groupB()?.getBoundingClientRect()
      return (
        !!rect &&
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      )
    }
    const onMove = (event: PointerEvent) => {
      const dragging = document.documentElement.hasAttribute('data-gridla-dragging')
      const next = dragging && inside(event)
      if (next === over) return
      over = next
      setRefused(next)
    }
    const onUp = (event: PointerEvent) => {
      if (!over) return
      over = false
      if (event.type === 'pointerup' && inside(event)) {
        push('drop into group B · the subtree is locked', 'warn')
        if (flashTimer !== null) window.clearTimeout(flashTimer)
        flashTimer = window.setTimeout(() => setRefused(false), 700)
      } else {
        setRefused(false)
      }
    }
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)
    return () => {
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onUp, true)
      if (flashTimer !== null) window.clearTimeout(flashTimer)
    }
  }, [state.lockB, push])

  return (
    <div ref={stageRef} style={{ display: 'contents' }}>
      <GridTransferScope>
        <GridProvider<Data>
          layout={shown.root}
          onLayoutChange={(next) => onChange('root', next)}
          gap={16}
          onTransferIn={(incoming, sourceId) =>
            push(`${incoming.id}: ${names.current.get(sourceId) ?? sourceId} to Root`)
          }
        >
          <NameTag name="Root" names={names} />
          <Stage
            layouts={layouts}
            shown={shown}
            lockB={state.lockB}
            height={state.height}
            inspected={hovered ?? state.item}
            log={log}
            refused={refused && state.lockB}
            names={names}
            onHover={setHovered}
            onPick={(id) => update({ item: id })}
            onChange={onChange}
            onLog={push}
            onLock={(lockB) => update({ lockB })}
            onHeight={(height) => update({ height })}
            onInspect={(item) => update({ item })}
            onReset={() => {
              reset()
              setLayouts(build())
              setLog([])
              setHovered(null)
            }}
          />
        </GridProvider>
      </GridTransferScope>
    </div>
  )
}
