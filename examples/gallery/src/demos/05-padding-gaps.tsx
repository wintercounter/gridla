import { useMemo, useState } from 'react'

import {
  canvasInnerRect,
  createItem,
  inferGap,
  placeItem,
  type GridLayout,
  type SolveResult,
} from 'gridla'
import { formatRect } from '@gridla/demo-kit'
import { Button, ControlGroup, DemoFrame, RangeField } from '@gridla/demo-kit/react'

import { CodeExample } from '../lib/code'
import { CoreInspector } from '../lib/core-inspector'
import { CoreStage, PaddingGuide, RectOutline, type StagePointer } from '../lib/core-stage'
import { useHashState } from '../lib/hash-state'

const SNIPPET = `import { canvasInnerRect, placeItem } from 'gridla'

const canvas = {
  width: 960,
  height: 600,
  padding: { top: 24, right: 48, bottom: 24, left: 48 }, // per side
  heightMode: 'bounded',
}
canvasInnerRect(canvas) // { x: 48, y: 24, w: 864, h: 552 }

// The gap is not part of the layout; every solver call takes it as an option
// so the same layout can be solved with different spacing.
placeItem({ layout, item: { id: 'note', w: 200, h: 120 }, pointer, options: { gap: 16 } })`

type Data = { label: string }

const DEFAULTS = { top: 24, right: 48, bottom: 24, left: 48, gap: 16 }

function build(p: typeof DEFAULTS): GridLayout<Data> {
  const canvas = {
    width: 960,
    height: 600,
    padding: { top: p.top, right: p.right, bottom: p.bottom, left: p.left },
    heightMode: 'bounded' as const,
  }
  const inner = canvasInnerRect(canvas)
  const w = Math.floor((inner.w - p.gap) / 2)
  const h = Math.floor((inner.h - p.gap) / 2)
  const labels = ['Panel A', 'Panel B', 'Panel C', 'Panel D']
  return {
    canvas,
    items: labels.map((label, index) =>
      createItem(
        `panel-${index + 1}`,
        {
          w: index % 2 === 1 ? inner.w - w - p.gap : w,
          h: index > 1 ? inner.h - h - p.gap : h,
          minW: 40,
          minH: 40,
        },
        inner.x + (index % 2) * (w + p.gap),
        inner.y + (index > 1 ? h + p.gap : 0),
        { label },
      ),
    ),
  }
}

export function PaddingGapsDemo() {
  const [state, update, reset] = useHashState(DEFAULTS)
  const base = useMemo(() => build(state), [state])
  const [placed, setPlaced] = useState<GridLayout<Data> | null>(null)
  const [last, setLast] = useState<SolveResult<Data> | null>(null)
  const layout = placed ?? base
  const inner = canvasInnerRect(layout.canvas)

  const place = ({ point }: StagePointer) => {
    const count = layout.items.filter((item) => item.id.startsWith('note')).length
    const result = placeItem<Data>({
      layout,
      item: {
        id: `note-${count + 1}`,
        w: 200,
        h: 120,
        minW: 40,
        minH: 40,
        data: { label: `Note ${count + 1}` },
      },
      pointer: point,
      options: { gap: state.gap },
    })
    setLast(result)
    if (result.accepted) setPlaced(result.layout)
  }

  return (
    <DemoFrame
      stageLabel="click to place a note"
      stage={
        <CoreStage
          layout={layout}
          ariaLabel="Canvas with adjustable padding and gaps; click places a note"
          onPointerDown={place}
        >
          <PaddingGuide canvas={layout.canvas} />
          {last && !last.accepted ? (
            <RectOutline rect={last.item} kind="rejected" label="rejected" />
          ) : null}
        </CoreStage>
      }
      controls={
        <>
          <ControlGroup title="Canvas padding">
            <RangeField
              label="Top"
              value={state.top}
              min={0}
              max={120}
              step={4}
              onChange={(top) => {
                update({ top })
                setPlaced(null)
                setLast(null)
              }}
              format={(v) => `${v}px`}
            />
            <RangeField
              label="Right"
              value={state.right}
              min={0}
              max={160}
              step={4}
              onChange={(right) => {
                update({ right })
                setPlaced(null)
                setLast(null)
              }}
              format={(v) => `${v}px`}
            />
            <RangeField
              label="Bottom"
              value={state.bottom}
              min={0}
              max={120}
              step={4}
              onChange={(bottom) => {
                update({ bottom })
                setPlaced(null)
                setLast(null)
              }}
              format={(v) => `${v}px`}
            />
            <RangeField
              label="Left"
              value={state.left}
              min={0}
              max={160}
              step={4}
              onChange={(left) => {
                update({ left })
                setPlaced(null)
                setLast(null)
              }}
              format={(v) => `${v}px`}
            />
          </ControlGroup>
          <ControlGroup title="Items">
            <RangeField
              label="Gap"
              value={state.gap}
              min={0}
              max={48}
              step={2}
              onChange={(gap) => {
                update({ gap })
                setPlaced(null)
                setLast(null)
              }}
              format={(v) => `${v}px`}
            />
          </ControlGroup>
          <div className="gd-actions">
            <Button
              variant="primary"
              onClick={() =>
                place({ point: { x: 480, y: 300 }, itemId: null, event: null as never })
              }
            >
              Place a note at center
            </Button>
            <Button
              onClick={() => {
                reset()
                setPlaced(null)
                setLast(null)
              }}
            >
              Reset
            </Button>
          </div>
        </>
      }
      inspector={
        <>
          <CoreInspector
            layout={layout}
            strategy={last?.strategy ?? null}
            accepted={last?.accepted}
            extra={
              <>
                <span>
                  inner rect <b>{formatRect(inner)}</b>
                </span>
                <span>
                  inferred gap <b>{inferGap(layout.items)}</b>
                </span>
              </>
            }
          />
          <CodeExample code={SNIPPET} />
        </>
      }
    />
  )
}
