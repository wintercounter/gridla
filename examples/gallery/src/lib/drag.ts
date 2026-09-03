import { useRef, useState } from 'react'

import {
  moveItem,
  type GridLayout,
  type GridPoint,
  type SolveOptions,
  type SolveResult,
} from 'gridla'

import type { StagePointer } from './core-stage'

type Grab = { itemId: string; offset: GridPoint }

/**
 * Pointer dragging for core demos: every move is a `moveItem` call against
 * the committed layout, so the preview is exactly what the solver returns.
 */
export function useCoreDrag<T>({
  layout,
  options,
  canDrag = () => true,
  onPreview,
  onCommit,
}: {
  layout: GridLayout<T>
  options: SolveOptions
  canDrag?: (itemId: string) => boolean
  onPreview: (result: SolveResult<T> | null) => void
  onCommit: (result: SolveResult<T>) => void
}) {
  const grab = useRef<Grab | null>(null)
  const last = useRef<SolveResult<T> | null>(null)
  const [active, setActive] = useState<string | null>(null)

  const onPointerDown = ({ point, itemId, event }: StagePointer) => {
    if (!itemId || !canDrag(itemId)) return
    const item = layout.items.find((entry) => entry.id === itemId)
    if (!item) return
    grab.current = { itemId, offset: { x: point.x - item.x, y: point.y - item.y } }
    last.current = null
    setActive(itemId)
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const onPointerMove = ({ point }: StagePointer) => {
    const current = grab.current
    if (!current) return
    const result = moveItem({
      layout,
      itemId: current.itemId,
      position: { x: point.x - current.offset.x, y: point.y - current.offset.y },
      options,
    })
    last.current = result
    onPreview(result)
  }

  const onPointerUp = () => {
    if (!grab.current) return
    grab.current = null
    setActive(null)
    if (last.current) onCommit(last.current)
    last.current = null
    onPreview(null)
  }

  return { active, onPointerDown, onPointerMove, onPointerUp }
}
