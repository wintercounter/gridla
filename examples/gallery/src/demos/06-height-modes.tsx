import { useMemo, useState } from 'react'

import {
  createItem,
  fitCanvasToContent,
  placeItem,
  type GridLayout,
  type SolveResult,
} from 'gridla'
import { canvas } from '@gridla/demo-kit'
import { Button, ControlGroup, DemoFrame, RangeField, Segmented } from '@gridla/demo-kit/react'

import { CodeExample } from '../lib/code'
import { CoreInspector } from '../lib/core-inspector'
import { canvasExtent, CoreStage, RectOutline, type StagePointer } from '../lib/core-stage'
import { useHashState } from '../lib/hash-state'

const SNIPPET = `import { fitCanvasToContent, placeItem } from 'gridla'

// bounded: items must fit inside canvas.height, so a full canvas rejects.
const bounded = placeItem({ layout, item: { id: 'card', w: 300, h: 160 }, pointer })
bounded.accepted // false when nothing can be trimmed or pushed
bounded.strategy // 'rejected'

// scrollable: the solver may stack below the bottom edge instead.
const scrollable = placeItem({
  layout: { ...layout, canvas: { ...layout.canvas, heightMode: 'scrollable' } },
  item: { id: 'card', w: 300, h: 160 },
  pointer,
})
scrollable.strategy // e.g. 'stack-below'
fitCanvasToContent(scrollable.layout.canvas, scrollable.layout.items).height // grown`

type Data = { label: string }

const DEFAULTS = { mode: 'bounded', w: 300, h: 160 }

function build(): GridLayout<Data> {
  const c = canvas(960, 420, 12)
  return {
    canvas: c,
    items: [
      createItem('header', { w: 936, h: 64, minH: 40, sizeMode: 'fixed-h' }, 12, 12, {
        label: 'Header',
      }),
      createItem('feed-a', { w: 462, h: 320, minW: 120, minH: 80 }, 12, 88, { label: 'Feed A' }),
      createItem('feed-b', { w: 462, h: 320, minW: 120, minH: 80 }, 486, 88, { label: 'Feed B' }),
    ],
  }
}

export function HeightModesDemo() {
  const [state, update, reset] = useHashState(DEFAULTS)
  const [items, setItems] = useState<GridLayout<Data>['items']>(() => build().items)
  const [last, setLast] = useState<SolveResult<Data> | null>(null)
  const layout = useMemo<GridLayout<Data>>(
    () => ({
      canvas: {
        ...build().canvas,
        heightMode: state.mode === 'scrollable' ? 'scrollable' : 'bounded',
      },
      items,
    }),
    [items, state.mode],
  )

  const place = ({ point }: StagePointer) => {
    const count = items.filter((item) => item.id.startsWith('card')).length
    const result = placeItem<Data>({
      layout,
      item: {
        id: `card-${count + 1}`,
        w: state.w,
        h: state.h,
        minW: 60,
        minH: 40,
        data: { label: `Card ${count + 1}` },
      },
      pointer: point,
      options: { gap: 12 },
    })
    setLast(result)
    if (result.accepted) setItems(result.layout.items)
  }

  const grown = fitCanvasToContent(layout.canvas, layout.items)

  return (
    <DemoFrame
      stageLabel={`${state.mode} · click to place`}
      stage={
        <CoreStage
          layout={layout}
          ariaLabel="A canvas that is either bounded or scrollable; clicking places a card"
          onPointerDown={place}
        >
          <div
            className="gl-padding-guide"
            aria-hidden="true"
            style={{ left: 0, right: 0, top: 0, height: layout.canvas.height, boxShadow: 'none' }}
          />
          {last && !last.accepted ? (
            <RectOutline rect={last.item} kind="rejected" label="rejected" />
          ) : null}
        </CoreStage>
      }
      controls={
        <>
          <ControlGroup title="Canvas height mode">
            <Segmented
              ariaLabel="Height mode"
              value={state.mode}
              options={[
                { value: 'bounded', label: 'bounded' },
                { value: 'scrollable', label: 'scrollable' },
              ]}
              onChange={(mode) => {
                update({ mode })
                setLast(null)
              }}
            />
          </ControlGroup>
          <ControlGroup title="New card">
            <RangeField
              label="Width"
              value={state.w}
              min={80}
              max={936}
              step={4}
              onChange={(w) => update({ w })}
              format={(v) => `${v}px`}
            />
            <RangeField
              label="Height"
              value={state.h}
              min={40}
              max={400}
              step={4}
              onChange={(h) => update({ h })}
              format={(v) => `${v}px`}
            />
          </ControlGroup>
          <div className="gd-actions">
            <Button
              variant="primary"
              onClick={() =>
                place({ point: { x: 480, y: 380 }, itemId: null, event: null as never })
              }
            >
              Place near the bottom
            </Button>
            <Button
              onClick={() => {
                reset()
                setItems(build().items)
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
                  authored height <b>{layout.canvas.height}</b>
                </span>
                <span>
                  content extent <b>{canvasExtent(layout)}</b>
                </span>
                <span>
                  fitCanvasToContent <b>{grown.height}</b>
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
