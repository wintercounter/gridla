import { useMemo, useState } from 'react'

import {
  createItem,
  flattenLayout,
  hitTest,
  type FlatItem,
  type GridLayout,
  type GridNode,
} from 'gridla'
import { canvas, formatRect } from '@gridla/demo-kit'
import {
  Button,
  ControlGroup,
  DemoFrame,
  RangeField,
  SelectField,
  Toggle,
} from '@gridla/demo-kit/react'

import { CodeExample } from '../lib/code'
import { CoreInspector } from '../lib/core-inspector'
import { CoreStage, type StagePointer } from '../lib/core-stage'
import { useHashState } from '../lib/hash-state'

const SNIPPET = `import { flattenLayout, hitTest } from 'gridla'

const tree = {
  id: 'root',
  layout: rootLayout, // 960×600, items: group-a, panel, group-b
  children: [
    { id: 'group-a', gap: 8, layout: groupLayout, children: [{ id: 'card-1' }, { id: 'card-2' }] },
    { id: 'panel' },
    { id: 'group-b', behavior: { locked: true }, layout: otherLayout, children: [{ id: 'note-1' }] },
  ],
}

// Every node becomes a FlatItem with a rect in ROOT pixels, projected through
// each ancestor's rendered size. canonicalRect is the authored entry in the parent.
const flat = flattenLayout(tree, { x: 0, y: 0, w: 1200, h: 720 })
flat.itemsById.get('card-1')?.rect          // root coordinates
flat.itemsById.get('card-1')?.canonicalRect // as authored inside group-a's 480×300 layout
hitTest(flat, { x: 300, y: 200 })            // deepest item under a root point`

type Data = { label: string }

const DEFAULTS = { width: 960, height: 600, lockB: false, item: '' }

function tree(lockB: boolean): GridNode<Data> {
  const rootLayout: GridLayout = {
    canvas: canvas(960, 600, 16),
    items: [
      createItem('group-a', { w: 560, h: 300, minW: 200, minH: 120 }, 16, 16),
      createItem('panel', { w: 352, h: 300, minW: 120, minH: 120 }, 592, 16),
      createItem('group-b', { w: 928, h: 252, minW: 200, minH: 100 }, 16, 332),
    ],
  }
  const groupA: GridLayout = {
    canvas: canvas(480, 300, 12),
    items: [
      createItem('card-1', { w: 222, h: 276, minW: 60, minH: 60 }, 12, 12),
      createItem('card-2', { w: 222, h: 132, minW: 60, minH: 60 }, 246, 12),
      createItem('card-3', { w: 222, h: 132, minW: 60, minH: 60 }, 246, 156),
    ],
  }
  const groupB: GridLayout = {
    canvas: canvas(600, 200, 10),
    items: [
      createItem('note-1', { w: 190, h: 180, minW: 40, minH: 40 }, 10, 10),
      createItem('note-2', { w: 190, h: 180, minW: 40, minH: 40 }, 205, 10),
      createItem('note-3', { w: 190, h: 180, minW: 40, minH: 40 }, 400, 10),
    ],
  }
  return {
    id: 'root',
    layout: rootLayout,
    data: { label: 'Root' },
    children: [
      {
        id: 'group-a',
        layout: groupA,
        gap: 12,
        data: { label: 'Group A' },
        children: [
          { id: 'card-1', data: { label: 'Card 1' } },
          { id: 'card-2', data: { label: 'Card 2' } },
          { id: 'card-3', data: { label: 'Card 3' } },
        ],
      },
      { id: 'panel', data: { label: 'Panel' } },
      {
        id: 'group-b',
        layout: groupB,
        gap: 5,
        behavior: { locked: lockB },
        data: { label: lockB ? 'Group B · locked' : 'Group B' },
        children: [
          { id: 'note-1', data: { label: 'Note 1' } },
          { id: 'note-2', data: { label: 'Note 2' } },
          { id: 'note-3', data: { label: 'Note 3' } },
        ],
      },
    ],
  }
}

export function NestedGroupsDemo() {
  const [state, update, reset] = useHashState(DEFAULTS)
  const [hovered, setHovered] = useState<string | null>(null)
  const root = useMemo(() => tree(state.lockB), [state.lockB])
  const rootRect = useMemo(
    () => ({ x: 0, y: 0, w: state.width, h: state.height }),
    [state.width, state.height],
  )
  const flat = useMemo(() => flattenLayout(root, rootRect), [root, rootRect])
  const inspected = hovered ?? state.item
  const target: FlatItem<GridNode<Data>> | undefined = flat.itemsById.get(inspected)
  const stageLayout = useMemo<GridLayout>(
    () => ({
      canvas: {
        width: rootRect.w,
        height: rootRect.h,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        heightMode: 'bounded',
      },
      items: [],
    }),
    [rootRect],
  )
  const rootLayoutRendered = flat.itemsById.get('root')?.layout ?? stageLayout

  const onMove = ({ point }: StagePointer) => {
    const hit = hitTest(flat, point)
    setHovered(hit && hit.id !== 'root' ? hit.id : null)
  }

  return (
    <DemoFrame
      stageLabel={`root rect ${state.width}×${state.height} · hover to inspect`}
      stage={
        <CoreStage
          layout={stageLayout}
          ariaLabel="A nested tree flattened into root coordinates; hover an item to inspect it"
          onPointerMove={onMove}
          onPointerLeave={() => setHovered(null)}
        >
          {flat.items
            .filter((item) => item.depth > 0)
            .map((item) => (
              <div
                key={item.id}
                className="gl-flat"
                data-container={item.isContainer ? '' : undefined}
                data-hover={item.id === inspected ? '' : undefined}
                style={{
                  width: item.rect.w,
                  height: item.rect.h,
                  transform: `translate(${item.rect.x}px, ${item.rect.y}px)`,
                  zIndex: item.depth,
                }}
              >
                {item.node.data?.label ?? item.id}
                <small>
                  d{item.depth} · {formatRect(item.rect)}
                </small>
              </div>
            ))}
        </CoreStage>
      }
      controls={
        <>
          <ControlGroup title="Root rect">
            <RangeField
              label="Width"
              value={state.width}
              min={480}
              max={1400}
              step={20}
              onChange={(width) => update({ width })}
              format={(v) => `${v}px`}
            />
            <RangeField
              label="Height"
              value={state.height}
              min={360}
              max={900}
              step={20}
              onChange={(height) => update({ height })}
              format={(v) => `${v}px`}
            />
          </ControlGroup>
          <ControlGroup title="Tree">
            <Toggle
              label="Lock group B subtree"
              checked={state.lockB}
              onChange={(lockB) => update({ lockB })}
            />
            <SelectField
              label="Inspect (keyboard)"
              value={state.item}
              options={[
                { value: '', label: '— none —' },
                ...flat.items
                  .filter((i) => i.depth > 0)
                  .map((i) => ({ value: i.id, label: `${'· '.repeat(i.depth - 1)}${i.id}` })),
              ]}
              onChange={(item) => update({ item })}
            />
          </ControlGroup>
          <div className="gd-actions">
            <Button onClick={reset}>Reset</Button>
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
            </div>
            <dl className="gl-readout" aria-live="polite">
              <dt>parent</dt>
              <dd>{target?.parentId ?? '—'}</dd>
              <dt>depth</dt>
              <dd>{target?.depth ?? '—'}</dd>
              <dt>root rect</dt>
              <dd data-accent>{target ? formatRect(target.rect) : '—'}</dd>
              <dt>canonical rect</dt>
              <dd>{target?.canonicalRect ? formatRect(target.canonicalRect) : '—'}</dd>
              <dt>rendered in parent</dt>
              <dd>{target?.sizing ? formatRect(target.sizing) : '—'}</dd>
              <dt>flags</dt>
              <dd>
                {target
                  ? [
                      target.isContainer && 'container',
                      target.acceptsChildren && 'accepts children',
                      target.locked && 'locked',
                      target.contained && 'contained',
                    ]
                      .filter(Boolean)
                      .join(', ') || 'leaf'
                  : '—'}
              </dd>
              <dt>gap</dt>
              <dd>{target?.gap ?? '—'}</dd>
            </dl>
          </div>
          <CoreInspector
            layout={rootLayoutRendered}
            title="Root layout rendered into the root rect"
          />
          <CodeExample code={SNIPPET} />
        </>
      }
    />
  )
}
