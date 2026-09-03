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
  type GridSize,
  type SolveOptions,
} from '../core'
import { createGridStore, type GridStore } from './store'
import type { TransferScope } from './transfer'
import type {
  GridActions,
  GridChangeDetail,
  GridControllerConfig,
  GridGestureApi,
  GridInteraction,
  GridPreview,
  GridState,
} from './types'

/**
 * Options for `createGridController`: every `SolveOptions` field, a controlled
 * or uncontrolled layout, change and transfer callbacks, and the settings that
 * make up `GridControllerConfig`. Framework adapters map their props onto this
 * shape and forward later changes with `setOptions`.
 */
export type GridControllerOptions<TData = unknown> = SolveOptions & {
  /**
   * Stable id of this controller, unique within a `TransferScope`. Generated
   * when omitted.
   */
  id?: string
  /**
   * Controlled layout. Pair with `onLayoutChange` and forward updates with
   * `setOptions`. Accepted changes render immediately; passing the emitted
   * layout back is a no-op, passing a different one overrides it.
   */
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
  /** Called when an item moves to another canvas inside the `scope`. */
  onTransferOut?: (itemId: string, targetId: string) => void
  /** Called when an item arrives from another canvas. */
  onTransferIn?: (item: GridItem<TData>, sourceId: string) => void
  /** Whether items from other canvases may be dropped here. Default `true`. */
  acceptTransfers?: boolean | ((item: GridItem<TData>, sourceId: string) => boolean)
  /** Transfer scope to register with. Items can move between controllers sharing one. */
  scope?: TransferScope | null
  /** Project the layout onto the measured size. Default `true`. */
  responsive?: boolean
  /** Minimum pointer travel before a press becomes a drag. Default `4`. */
  dragThreshold?: number
  /** Pixels moved per arrow key press. Default `8`. */
  keyboardStep?: number
  /** Controlled selection. */
  selectedId?: string | null
  onSelectedIdChange?: (itemId: string | null) => void
}

/**
 * Framework-neutral owner of one canvas: layout state, projection onto the
 * measured size, the gesture API, and the imperative actions. Adapters render
 * from `store` and feed input through `gesture` (or `createPointerGesture`).
 */
export type GridController<TData = unknown> = {
  /** Id of this controller. Used by transfer scopes. */
  id: string
  /** State store. Subscribe to it to render. */
  store: GridStore<GridState<TData>>
  /** Imperative layout and selection API. Stable for the controller's lifetime. */
  actions: GridActions<TData>
  /** Low-level gesture API. Stable for the controller's lifetime. */
  gesture: GridGestureApi<TData>
  /** The resolved configuration currently in effect. */
  getConfig: () => GridControllerConfig
  /**
   * Replace the configuration. When a value changed, the layout is projected
   * again onto the measured size.
   */
  setConfig: (config: GridControllerConfig) => void
  /**
   * Apply changed options: callbacks, config fields, the controlled `layout`
   * and `selectedId`, and the transfer `scope`. Cheap to call on every render.
   */
  setOptions: (options: GridControllerOptions<TData>) => void
  /** Sync a controlled layout into the store (no-op when it is already current). */
  setLayout: (layout: GridLayout<TData>) => void
  /** Update the measured canvas size and project the layout onto it. */
  setSize: (size: GridSize | null) => void
  /** Unregister from the transfer scope and drop the gesture in progress. */
  destroy: () => void
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

let nextId = 0

/**
 * Project `source` onto the measured `size` (when `config.responsive`), then
 * fit the canvas to its content. Without a size, or when not responsive, the
 * layout is only normalized. This is the layout a controller stores in
 * `GridState.layout`.
 */
export function renderLayout<TData>(
  source: GridLayout<TData>,
  size: GridSize | null,
  config: GridControllerConfig,
): GridLayout<TData> {
  const canvas = normalizeCanvas(source.canvas)
  if (!config.responsive || !size) {
    return { canvas, items: source.items.map((item) => normalizeItem(item, canvas)) }
  }
  const target = {
    ...canvas,
    width: Math.max(1, size.w),
    // A scrollable canvas keeps its authored height: re-projecting vertical
    // geometry from a measurement that itself depends on content height would
    // grow without bound. Only the width follows the element.
    height: canvas.heightMode === 'scrollable' ? canvas.height : Math.max(1, size.h),
  }
  const projected = projectLayout(source, target, { gap: config.gap })
  return { ...projected, canvas: fitCanvasToContent(projected.canvas, projected.items) }
}

/**
 * Resolve `GridControllerConfig` from controller options by applying the
 * defaults (`responsive: true`, `dragThreshold: 4`, `keyboardStep: 8`, `gap: 0`).
 */
export function resolveControllerConfig<TData>(
  options: GridControllerOptions<TData>,
): GridControllerConfig {
  return {
    responsive: options.responsive ?? true,
    dragThreshold: options.dragThreshold ?? 4,
    keyboardStep: options.keyboardStep ?? 8,
    gap: options.gap ?? 0,
    snapDistance: options.snapDistance,
    snap: options.snap,
    onTrace: options.onTrace,
  }
}

function configsEqual(a: GridControllerConfig, b: GridControllerConfig): boolean {
  return (
    a.responsive === b.responsive &&
    a.dragThreshold === b.dragThreshold &&
    a.keyboardStep === b.keyboardStep &&
    a.gap === b.gap &&
    a.snapDistance === b.snapDistance &&
    a.snap === b.snap &&
    a.onTrace === b.onTrace
  )
}

function solveOptions(config: GridControllerConfig, overrides?: SolveOptions): SolveOptions {
  return {
    gap: config.gap,
    snapDistance: config.snapDistance,
    snap: config.snap,
    onTrace: config.onTrace,
    ...overrides,
  }
}

/**
 * Create a `GridController`. Give it a `layout` (controlled: every accepted
 * change is reported through `onLayoutChange` and the store follows the next
 * `setOptions({ layout })`) or a `defaultLayout` (uncontrolled: the controller
 * owns the layout and still reports changes). Call `setSize` with the measured
 * canvas size (see `observeSize`) and `destroy` when the canvas goes away.
 */
export function createGridController<TData = unknown>(
  options: GridControllerOptions<TData> = {},
): GridController<TData> {
  const id = options.id ?? `gridla-${(nextId += 1)}`
  let current = options
  let config = resolveControllerConfig(options)
  let element: HTMLElement | null = null
  let incoming: { item: GridItem<TData>; preview: GridPreview<TData> } | null = null
  let lastSnap: boolean | undefined
  let unregister: (() => void) | null = null
  let registeredScope: TransferScope | null = null

  const source = (options.layout ??
    options.defaultLayout ??
    (EMPTY_LAYOUT as GridLayout<TData>)) as GridLayout<TData>
  const store = createGridStore<GridState<TData>>({
    source,
    size: null,
    layout: renderLayout(source, null, config),
    interaction: null,
    activeRect: null,
    preview: null,
    selectedId: options.selectedId ?? null,
    transferring: false,
  })

  const emitChange = (next: GridLayout<TData>, detail: GridChangeDetail, commitDetail = false) => {
    const state = store.getSnapshot()
    // Applied right away in both modes. A controlled owner that passes the
    // same layout back is a no-op (`setLayout` compares by reference); one that
    // passes something else overrides it. Waiting for the owner would leave a
    // stale layout behind for the next event when the framework applies props
    // asynchronously (a second key press within one change-detection tick).
    store.set({ ...state, source: next, layout: renderLayout(next, state.size, config) })
    current.onLayoutChange?.(next, detail)
    if (commitDetail) current.onCommit?.(detail)
  }

  const opts = (overrides?: SolveOptions) => solveOptions(config, overrides)
  const snapOpts = (snapOverride?: boolean) =>
    opts(snapOverride === undefined ? undefined : { snap: snapOverride })

  const findRendered = (itemId: string) =>
    store.getSnapshot().layout.items.find((item) => item.id === itemId) ?? null

  const solveMove = (
    state: GridState<TData>,
    position: GridPoint,
    snapOverride: boolean | undefined,
  ): GridPreview<TData> | null => {
    const { interaction, layout } = state
    if (!interaction) return state.preview
    const result = moveItem({
      layout,
      itemId: interaction.itemId,
      position,
      options: snapOpts(snapOverride),
    })
    if (!result.accepted) return state.preview
    return {
      layout: result.layout,
      item: result.item,
      strategy: result.strategy,
      shiftedSiblings: result.shiftedSiblings,
      accepted: true,
    }
  }

  const clearGesture = (state: GridState<TData>): GridState<TData> => ({
    ...state,
    interaction: null,
    activeRect: null,
    preview: null,
    transferring: false,
  })

  const actions: GridActions<TData> = {
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
      current.onSelectedIdChange?.(itemId)
    },
    cancel: () => {
      const state = store.getSnapshot()
      if (!state.interaction && !state.preview) return
      store.set(clearGesture(state))
    },
    previewIncoming: (item, pointer) => gesture.previewIncoming(item, pointer),
    commitIncoming: () => gesture.commitIncoming() !== null,
    clearIncoming: () => gesture.clearIncoming(),
  }

  const begin = (item: GridItem<TData>, interaction: Omit<GridInteraction, 'origin'>): boolean => {
    const { itemId } = interaction
    const state = store.getSnapshot()
    const origin = { x: item.x, y: item.y, w: item.w, h: item.h }
    store.set({
      ...state,
      interaction: { ...interaction, origin },
      activeRect: origin,
      preview: null,
      selectedId: itemId,
      transferring: false,
    })
    if (state.selectedId !== itemId) current.onSelectedIdChange?.(itemId)
    return true
  }

  const gesture: GridGestureApi<TData> = {
    beginMove: (itemId, pointer, pointerId) => {
      const item = findRendered(itemId)
      if (!item) return false
      return begin(item, {
        itemId,
        mode: 'move',
        pointerId,
        grabOffset: { x: pointer.x - item.x, y: pointer.y - item.y },
        start: pointer,
      })
    },
    beginResize: (itemId, edge, pointer, pointerId) => {
      const item = findRendered(itemId)
      if (!item) return false
      return begin(item, {
        itemId,
        mode: 'resize',
        edge,
        pointerId,
        grabOffset: { x: 0, y: 0 },
        start: pointer,
      })
    },
    updateMove: (pointer, modifiers) => {
      const state = store.getSnapshot()
      const { interaction } = state
      if (!interaction || interaction.mode !== 'move') return
      const position = {
        x: pointer.x - interaction.grabOffset.x,
        y: pointer.y - interaction.grabOffset.y,
      }
      const activeRect: GridRect = { ...interaction.origin, ...position }
      lastSnap = modifiers.snap
      // While another canvas previews the item, this canvas shows its base
      // layout with no preview; only the active item follows the pointer.
      if (state.transferring) {
        store.set({ ...state, activeRect, preview: null })
        return
      }
      store.set({ ...state, activeRect, preview: solveMove(state, position, modifiers.snap) })
    },
    updateResize: (pointer, modifiers) => {
      const state = store.getSnapshot()
      const { interaction, layout } = state
      if (!interaction || interaction.mode !== 'resize' || !interaction.edge) return
      const delta = { x: pointer.x - interaction.start.x, y: pointer.y - interaction.start.y }
      const original = layout.items.find((item) => item.id === interaction.itemId)
      if (!original) return
      const tracked = resizeRect(original, interaction.edge, delta, boundsFromCanvas(layout.canvas))
      const result = resizeItem({
        layout,
        itemId: interaction.itemId,
        edge: interaction.edge,
        delta,
        options: snapOpts(modifiers.snap),
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
      // Entering another canvas drops this canvas' own move preview so
      // siblings settle back and the outline disappears here; coming back
      // re-solves at the current pointer so the preview needs no extra move.
      const preview =
        transferring || !state.activeRect || state.interaction?.mode !== 'move'
          ? null
          : solveMove(state, state.activeRect, lastSnap)
      store.set({ ...state, transferring, preview })
    },
    commit: () => {
      const state = store.getSnapshot()
      const { interaction, preview } = state
      store.set(clearGesture(state))
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
      const result = placeItem<TData>({ layout: state.layout, item, pointer, options: opts() })
      const preview: GridPreview<TData> = {
        layout: result.layout,
        item: result.item,
        strategy: result.strategy,
        shiftedSiblings: result.shiftedSiblings,
        accepted: result.accepted,
      }
      incoming = result.accepted ? { item, preview } : null
      store.set({ ...state, preview: result.accepted ? preview : null })
      return result.accepted ? preview : null
    },
    clearIncoming: () => {
      incoming = null
      const state = store.getSnapshot()
      if (state.preview && !state.interaction) store.set({ ...state, preview: null })
    },
    commitIncoming: () => {
      const pending = incoming
      incoming = null
      const state = store.getSnapshot()
      store.set({ ...state, preview: null })
      if (!pending) return null
      emitChange(
        pending.preview.layout,
        { reason: 'transfer', itemId: pending.item.id, strategy: pending.preview.strategy },
        true,
      )
      return pending.preview.layout
    },
    completeOutgoing: (itemId) => {
      store.set(clearGesture(store.getSnapshot()))
      const { layout } = store.getSnapshot()
      emitChange(
        { canvas: layout.canvas, items: layout.items.filter((item) => item.id !== itemId) },
        { reason: 'transfer', itemId },
        true,
      )
    },
    getElement: () => element,
    setElement: (next) => {
      element = next
    },
  }

  const setLayout = (layout: GridLayout<TData>) => {
    const state = store.getSnapshot()
    if (state.source === layout) return
    store.set({ ...state, source: layout, layout: renderLayout(layout, state.size, config) })
  }

  const setConfig = (next: GridControllerConfig) => {
    if (configsEqual(config, next)) return
    config = next
    const state = store.getSnapshot()
    store.set({ ...state, layout: renderLayout(state.source, state.size, config) })
  }

  const setScope = (scope: TransferScope | null | undefined) => {
    const next = scope ?? null
    if (next === registeredScope) return
    unregister?.()
    unregister = null
    registeredScope = next
    if (!next) return
    unregister = next.register({
      id,
      getElement: () => element,
      accepts: (item, sourceId) => {
        const accept = current.acceptTransfers ?? true
        return typeof accept === 'function' ? accept(item as GridItem<TData>, sourceId) : accept
      },
      gesture: gesture as unknown as GridGestureApi,
      store: store as unknown as GridStore<GridState>,
      notifyTransferOut: (itemId, targetId) => current.onTransferOut?.(itemId, targetId),
      notifyTransferIn: (item, sourceId) =>
        current.onTransferIn?.(item as GridItem<TData>, sourceId),
    })
  }

  const setOptions = (options: GridControllerOptions<TData>) => {
    current = options
    if (options.layout !== undefined) setLayout(options.layout)
    setConfig(resolveControllerConfig(options))
    if (options.selectedId !== undefined) {
      const state = store.getSnapshot()
      if (state.selectedId !== options.selectedId)
        store.set({ ...state, selectedId: options.selectedId })
    }
    setScope(options.scope)
  }

  setScope(options.scope)

  return {
    id,
    store,
    actions,
    gesture,
    getConfig: () => config,
    setConfig,
    setOptions,
    setLayout,
    setSize: (size) => {
      const state = store.getSnapshot()
      if (state.size && size && state.size.w === size.w && state.size.h === size.h) return
      store.set({ ...state, size, layout: renderLayout(state.source, size, config) })
    },
    destroy: () => {
      actions.cancel()
      unregister?.()
      unregister = null
      registeredScope = null
      element = null
    },
  }
}
