import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'

import {
  boundsFromCanvas,
  fitCanvasToContent,
  moveItem,
  normalizeCanvas,
  normalizeItem,
  placeItem,
  projectLayout,
  resizeItem,
  resizeRect,
  type GridItem,
  type GridLayout,
  type GridPoint,
  type GridRect,
  type GridResizeEdge,
  type GridSize,
  type SolveOptions,
} from '../core'
import { GridContext, type GridContextValue, type GridGestureApi } from './context'
import { createStore, type Store } from './store'
import { useTransferScope } from './transfer-context'
import type {
  GridActions,
  GridChangeDetail,
  GridPreview,
  GridProviderConfig,
  GridState,
} from './types'

export type GridProviderProps<TData = unknown> = SolveOptions & {
  /** Controlled layout. Pair with `onLayoutChange`. */
  layout?: GridLayout<TData>
  /** Initial layout for uncontrolled use. */
  defaultLayout?: GridLayout<TData>
  /**
   * Called with the next layout after every accepted change. The layout is
   * expressed in the canvas size it was rendered at.
   */
  onLayoutChange?: (layout: GridLayout<TData>, detail: GridChangeDetail) => void
  /** Fires with the solver strategy on every accepted interactive commit. */
  onCommit?: (detail: GridChangeDetail) => void
  /** Called when an item moves to another canvas inside a `GridTransferScope`. */
  onTransferOut?: (itemId: string, targetId: string) => void
  /** Called when an item arrives from another canvas. */
  onTransferIn?: (item: GridItem<TData>, sourceId: string) => void
  /** Whether items from other canvases may be dropped here. Default `true`. */
  acceptTransfers?: boolean | ((item: GridItem<TData>, sourceId: string) => boolean)
  responsive?: boolean
  dragThreshold?: number
  keyboardStep?: number
  /** Controlled selection. */
  selectedId?: string | null
  onSelectedIdChange?: (itemId: string | null) => void
  children?: ReactNode
}

const EMPTY_LAYOUT: GridLayout = {
  canvas: {
    width: 1,
    height: 1,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    heightMode: 'bounded',
  },
  items: [],
}

function renderLayout<TData>(
  source: GridLayout<TData>,
  size: GridSize | null,
  config: GridProviderConfig,
): GridLayout<TData> {
  const canvas = normalizeCanvas(source.canvas)
  if (!config.responsive || !size) {
    return { canvas, items: source.items.map((item) => normalizeItem(item, canvas)) }
  }
  const target = {
    ...canvas,
    width: Math.max(1, size.w),
    height:
      canvas.heightMode === 'scrollable' ? Math.max(1, size.h, canvas.height) : Math.max(1, size.h),
  }
  const projected = projectLayout(source, target, { gap: config.gap })
  return { ...projected, canvas: fitCanvasToContent(projected.canvas, projected.items) }
}

function solveOptions(config: GridProviderConfig, overrides?: SolveOptions): SolveOptions {
  return {
    gap: config.gap,
    snapDistance: config.snapDistance,
    snap: config.snap,
    onTrace: config.onTrace,
    ...overrides,
  }
}

/**
 * Owns layout state and gesture state for one canvas. Place a `GridCanvas`
 * (or your own element wired with `useGridInteraction`) inside it.
 */
export function GridProvider<TData = unknown>(props: GridProviderProps<TData>) {
  const {
    layout: controlledLayout,
    defaultLayout,
    onLayoutChange,
    onCommit,
    onTransferOut,
    onTransferIn,
    acceptTransfers = true,
    responsive = true,
    dragThreshold = 4,
    keyboardStep = 8,
    gap = 0,
    snapDistance,
    snap,
    onTrace,
    selectedId: controlledSelectedId,
    onSelectedIdChange,
    children,
  } = props

  const id = useId()
  const config = useMemo<GridProviderConfig>(
    () => ({ responsive, dragThreshold, keyboardStep, gap, snapDistance, snap, onTrace }),
    [responsive, dragThreshold, keyboardStep, gap, snapDistance, snap, onTrace],
  )
  const configRef = useRef(config)
  const callbacksRef = useRef({
    onLayoutChange,
    onCommit,
    onTransferOut,
    onTransferIn,
    onSelectedIdChange,
    acceptTransfers,
  })
  const isControlled = controlledLayout !== undefined
  const isControlledRef = useRef(isControlled)
  useEffect(() => {
    configRef.current = config
    isControlledRef.current = isControlled
    callbacksRef.current = {
      onLayoutChange,
      onCommit,
      onTransferOut,
      onTransferIn,
      onSelectedIdChange,
      acceptTransfers,
    }
  })

  const [store] = useState<Store<GridState<TData>>>(() => {
    const source = (controlledLayout ??
      defaultLayout ??
      (EMPTY_LAYOUT as GridLayout<TData>)) as GridLayout<TData>
    return createStore<GridState<TData>>({
      source,
      size: null,
      layout: renderLayout(source, null, config),
      interaction: null,
      activeRect: null,
      preview: null,
      selectedId: controlledSelectedId ?? null,
      transferring: false,
    })
  })

  const elementRef = useRef<HTMLElement | null>(null)
  const incomingRef = useRef<{ item: GridItem<TData>; preview: GridPreview<TData> } | null>(null)

  const emitChange = (next: GridLayout<TData>, detail: GridChangeDetail, commitDetail = false) => {
    const state = store.getSnapshot()
    if (!isControlledRef.current) {
      store.set({
        ...state,
        source: next,
        layout: renderLayout(next, state.size, configRef.current),
      })
    }
    callbacksRef.current.onLayoutChange?.(next, detail)
    if (commitDetail) callbacksRef.current.onCommit?.(detail)
  }

  const actions = useMemo<GridActions<TData>>(() => {
    const opts = (overrides?: SolveOptions) => solveOptions(configRef.current, overrides)
    return {
      setLayout: (next) => emitChange(next, { reason: 'set' }),
      move: (itemId, position, overrides) => {
        const { layout } = store.getSnapshot()
        const result = moveItem({ layout, itemId, position, options: opts(overrides) })
        if (!result.accepted) return false
        emitChange(result.layout, { reason: 'move', itemId, strategy: result.strategy })
        return true
      },
      resize: (itemId, change, overrides) => {
        const { layout } = store.getSnapshot()
        const result = resizeItem({ layout, itemId, ...change, options: opts(overrides) })
        if (!result.accepted) return false
        emitChange(result.layout, { reason: 'resize', itemId, strategy: result.strategy })
        return true
      },
      place: (item, at, overrides) => {
        const { layout } = store.getSnapshot()
        const result = placeItem<TData>({ layout, item, ...at, options: opts(overrides) })
        if (!result.accepted) return false
        emitChange(result.layout, { reason: 'place', itemId: item.id, strategy: result.strategy })
        return true
      },
      remove: (itemId) => {
        const { layout } = store.getSnapshot()
        if (!layout.items.some((item) => item.id === itemId)) return
        emitChange(
          { canvas: layout.canvas, items: layout.items.filter((item) => item.id !== itemId) },
          { reason: 'remove', itemId },
        )
      },
      update: (itemId, patch) => {
        const { layout } = store.getSnapshot()
        const bounds = normalizeCanvas(layout.canvas)
        let found = false
        const items = layout.items.map((item) => {
          if (item.id !== itemId) return item
          found = true
          return normalizeItem({ ...item, ...patch, id: itemId }, bounds)
        })
        if (!found) return
        emitChange({ canvas: layout.canvas, items }, { reason: 'update', itemId })
      },
      select: (itemId) => {
        const state = store.getSnapshot()
        if (state.selectedId !== itemId) store.set({ ...state, selectedId: itemId })
        callbacksRef.current.onSelectedIdChange?.(itemId)
      },
      cancel: () => {
        const state = store.getSnapshot()
        if (!state.interaction && !state.preview) return
        store.set({
          ...state,
          interaction: null,
          activeRect: null,
          preview: null,
          transferring: false,
        })
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store])

  const gesture = useMemo<GridGestureApi<TData>>(() => {
    const opts = (snapOverride?: boolean) =>
      solveOptions(
        configRef.current,
        snapOverride === undefined ? undefined : { snap: snapOverride },
      )
    const findRendered = (itemId: string) => {
      const { layout } = store.getSnapshot()
      return layout.items.find((item) => item.id === itemId) ?? null
    }
    return {
      beginMove: (itemId, pointer, pointerId) => {
        const item = findRendered(itemId)
        if (!item) return false
        const state = store.getSnapshot()
        const origin = { x: item.x, y: item.y, w: item.w, h: item.h }
        store.set({
          ...state,
          interaction: {
            itemId,
            mode: 'move',
            pointerId,
            grabOffset: { x: pointer.x - item.x, y: pointer.y - item.y },
            origin,
            start: pointer,
          },
          activeRect: origin,
          preview: null,
          selectedId: itemId,
          transferring: false,
        })
        if (state.selectedId !== itemId) callbacksRef.current.onSelectedIdChange?.(itemId)
        return true
      },
      beginResize: (itemId, edge, pointer, pointerId) => {
        const item = findRendered(itemId)
        if (!item) return false
        const state = store.getSnapshot()
        const origin = { x: item.x, y: item.y, w: item.w, h: item.h }
        store.set({
          ...state,
          interaction: {
            itemId,
            mode: 'resize',
            edge,
            pointerId,
            grabOffset: { x: 0, y: 0 },
            origin,
            start: pointer,
          },
          activeRect: origin,
          preview: null,
          selectedId: itemId,
          transferring: false,
        })
        if (state.selectedId !== itemId) callbacksRef.current.onSelectedIdChange?.(itemId)
        return true
      },
      updateMove: (pointer, modifiers) => {
        const state = store.getSnapshot()
        const { interaction, layout } = state
        if (!interaction || interaction.mode !== 'move') return
        const position = {
          x: pointer.x - interaction.grabOffset.x,
          y: pointer.y - interaction.grabOffset.y,
        }
        const activeRect: GridRect = { ...interaction.origin, ...position }
        const result = moveItem({
          layout,
          itemId: interaction.itemId,
          position,
          options: opts(modifiers.snap),
        })
        const preview: GridPreview<TData> = {
          layout: result.layout,
          item: result.item,
          strategy: result.strategy,
          shiftedSiblings: result.shiftedSiblings,
          accepted: result.accepted,
        }
        store.set({
          ...state,
          activeRect,
          preview: result.accepted ? preview : state.preview,
          transferring: false,
        })
      },
      updateResize: (pointer, modifiers) => {
        const state = store.getSnapshot()
        const { interaction, layout } = state
        if (!interaction || interaction.mode !== 'resize' || !interaction.edge) return
        const delta = { x: pointer.x - interaction.start.x, y: pointer.y - interaction.start.y }
        const original = layout.items.find((item) => item.id === interaction.itemId)
        if (!original) return
        const tracked = resizeRect(
          original,
          interaction.edge,
          delta,
          boundsFromCanvas(layout.canvas),
        )
        const result = resizeItem({
          layout,
          itemId: interaction.itemId,
          edge: interaction.edge,
          delta,
          options: opts(modifiers.snap),
        })
        const preview: GridPreview<TData> = {
          layout: result.layout,
          item: result.item,
          strategy: result.strategy,
          shiftedSiblings: result.shiftedSiblings,
          accepted: result.accepted,
        }
        store.set({
          ...state,
          activeRect: { x: tracked.x, y: tracked.y, w: tracked.w, h: tracked.h },
          preview: result.accepted ? preview : state.preview,
        })
      },
      setTransferring: (transferring) => {
        const state = store.getSnapshot()
        if (state.transferring === transferring) return
        store.set({ ...state, transferring })
      },
      commit: () => {
        const state = store.getSnapshot()
        const { interaction, preview } = state
        store.set({
          ...state,
          interaction: null,
          activeRect: null,
          preview: null,
          transferring: false,
        })
        if (!interaction || !preview || !preview.accepted) return
        emitChange(
          preview.layout,
          { reason: interaction.mode, itemId: interaction.itemId, strategy: preview.strategy },
          true,
        )
      },
      cancel: () => actions.cancel(),
      previewIncoming: (item, pointer) => {
        const state = store.getSnapshot()
        const result = placeItem<TData>({
          layout: state.layout,
          item,
          pointer,
          options: opts(),
        })
        const preview: GridPreview<TData> = {
          layout: result.layout,
          item: result.item,
          strategy: result.strategy,
          shiftedSiblings: result.shiftedSiblings,
          accepted: result.accepted,
        }
        incomingRef.current = result.accepted ? { item, preview } : null
        store.set({ ...state, preview: result.accepted ? preview : null })
        return result.accepted ? preview : null
      },
      clearIncoming: () => {
        incomingRef.current = null
        const state = store.getSnapshot()
        if (state.preview && !state.interaction) store.set({ ...state, preview: null })
      },
      commitIncoming: () => {
        const incoming = incomingRef.current
        incomingRef.current = null
        const state = store.getSnapshot()
        store.set({ ...state, preview: null })
        if (!incoming) return null
        emitChange(
          incoming.preview.layout,
          { reason: 'transfer', itemId: incoming.item.id, strategy: incoming.preview.strategy },
          true,
        )
        return incoming.preview.layout
      },
      completeOutgoing: (itemId) => {
        const state = store.getSnapshot()
        store.set({
          ...state,
          interaction: null,
          activeRect: null,
          preview: null,
          transferring: false,
        })
        const { layout } = store.getSnapshot()
        emitChange(
          { canvas: layout.canvas, items: layout.items.filter((item) => item.id !== itemId) },
          { reason: 'transfer', itemId },
          true,
        )
      },
      getElement: () => elementRef.current,
      setElement: (element) => {
        elementRef.current = element
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, actions])

  // Controlled layout: sync into the store when the prop changes.
  useEffect(() => {
    if (controlledLayout === undefined) return
    const state = store.getSnapshot()
    if (state.source === controlledLayout) return
    store.set({
      ...state,
      source: controlledLayout,
      layout: renderLayout(controlledLayout, state.size, configRef.current),
    })
  }, [controlledLayout, store])

  // Config changes (gap, responsive) re-render the projected layout.
  useEffect(() => {
    const state = store.getSnapshot()
    store.set({ ...state, layout: renderLayout(state.source, state.size, config) })
  }, [config, store])

  useEffect(() => {
    if (controlledSelectedId === undefined) return
    const state = store.getSnapshot()
    if (state.selectedId !== controlledSelectedId)
      store.set({ ...state, selectedId: controlledSelectedId })
  }, [controlledSelectedId, store])

  const value = useMemo<GridContextValue<TData>>(
    () => ({ id, store, actions, config, gesture }),
    [id, store, actions, config, gesture],
  )

  const scope = useTransferScope()
  useEffect(() => {
    if (!scope) return
    return scope.register({
      id,
      getElement: () => elementRef.current,
      accepts: (item, sourceId) => {
        const accept = callbacksRef.current.acceptTransfers
        return typeof accept === 'function' ? accept(item as GridItem<TData>, sourceId) : accept
      },
      gesture: gesture as unknown as GridGestureApi,
      store: store as unknown as Store<GridState>,
      notifyTransferOut: (itemId, targetId) =>
        callbacksRef.current.onTransferOut?.(itemId, targetId),
      notifyTransferIn: (item, sourceId) =>
        callbacksRef.current.onTransferIn?.(item as GridItem<TData>, sourceId),
    })
  }, [scope, id, gesture, store])

  return (
    <GridContext.Provider value={value as unknown as GridContextValue}>
      {children}
    </GridContext.Provider>
  )
}

/** Update the measured size. Used by `GridCanvas`; exposed for custom canvases. */
export function applyMeasuredSize<TData>(
  store: Store<GridState<TData>>,
  size: GridSize | null,
  config: GridProviderConfig,
) {
  const state = store.getSnapshot()
  if (state.size && size && state.size.w === size.w && state.size.h === size.h) return
  store.set({ ...state, size, layout: renderLayout(state.source, size, config) })
}

export type { GridPoint, GridResizeEdge }
