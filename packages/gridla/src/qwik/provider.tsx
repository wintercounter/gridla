/** @jsxImportSource @builder.io/qwik */
import {
  component$,
  noSerialize,
  Slot,
  useConstant,
  useContext,
  useContextProvider,
  useId,
  useSignal,
  useStore,
  useTask$,
  useVisibleTask$,
  type PropFunction,
} from '@builder.io/qwik'

import type { GridItem, GridLayout } from '../core'
import {
  createGridController,
  renderLayout,
  resolveControllerConfig,
  type GridControllerOptions,
} from '../interaction/controller'
import { createTransferScope } from '../interaction/transfer'
import type { GridChangeDetail, GridState } from '../interaction/types'
import {
  GridContextId,
  TransferScopeContextId,
  type GridContextValue,
  type GridRuntime,
} from './context'

/**
 * Props for `GridProvider`. They mirror the React provider; callbacks carry
 * the Qwik `$` suffix because Qwik serializes them as QRLs. `acceptTransfers`
 * is a boolean only: the controller needs a synchronous answer and a QRL
 * resolves asynchronously.
 */
export type GridProviderProps<TData = unknown> = {
  /** Controlled layout. Pair with `onLayoutChange$`. */
  layout?: GridLayout<TData>
  /** Initial layout for uncontrolled use. */
  defaultLayout?: GridLayout<TData>
  /**
   * Called with the next layout after every accepted change. The layout is
   * expressed in the canvas size it was rendered at.
   */
  onLayoutChange$?: PropFunction<(layout: GridLayout<TData>, detail: GridChangeDetail) => void>
  /** Fires with the solver strategy on every accepted interactive commit. */
  onCommit$?: PropFunction<(detail: GridChangeDetail) => void>
  /** Called when an item moves to another canvas inside a `GridTransferScope`. */
  onTransferOut$?: PropFunction<(itemId: string, targetId: string) => void>
  /** Called when an item arrives from another canvas. */
  onTransferIn$?: PropFunction<(item: GridItem<TData>, sourceId: string) => void>
  /** Whether items from other canvases may be dropped here. Default `true`. */
  acceptTransfers?: boolean
  /** Minimum distance kept between neighbors. Default `0`. */
  gap?: number
  /** Distance within which edges attract. Default `24`. */
  snapDistance?: number
  /** When `false`, alignment snapping is skipped. Default `true`. */
  snap?: boolean
  /** Project the layout onto the measured canvas size. Default `true`. */
  responsive?: boolean
  /** Minimum pointer travel before a press becomes a drag. Default `4`. */
  dragThreshold?: number
  /** Pixels moved per arrow key press. Default `8`; Shift multiplies by 4. */
  keyboardStep?: number
  /** Controlled selection. */
  selectedId?: string | null
  onSelectedIdChange$?: PropFunction<(itemId: string | null) => void>
}

function controllerOptions<TData>(
  props: GridProviderProps<TData>,
  runtime: GridRuntime<TData>,
): GridControllerOptions<TData> {
  // Read the callback props when they fire so the controller always calls
  // the QRL from the latest render.
  return {
    id: runtime.id,
    layout: props.layout,
    defaultLayout: props.defaultLayout,
    gap: props.gap,
    snapDistance: props.snapDistance,
    snap: props.snap,
    responsive: props.responsive,
    dragThreshold: props.dragThreshold,
    keyboardStep: props.keyboardStep,
    selectedId: props.selectedId,
    acceptTransfers: props.acceptTransfers,
    scope: runtime.scope ?? null,
    onLayoutChange: (layout, detail) => void props.onLayoutChange$?.(layout, detail),
    onCommit: (detail) => void props.onCommit$?.(detail),
    onTransferOut: (itemId, targetId) => void props.onTransferOut$?.(itemId, targetId),
    onTransferIn: (item, sourceId) => void props.onTransferIn$?.(item, sourceId),
    onSelectedIdChange: (itemId) => void props.onSelectedIdChange$?.(itemId),
  }
}

/**
 * Props the controller must follow. Qwik passes props that come from signals
 * as derived signals behind the props proxy, so each one is tracked through a
 * read; tracking the props object alone would miss them.
 */
const TRACKED_PROPS = [
  'layout',
  'defaultLayout',
  'gap',
  'snapDistance',
  'snap',
  'responsive',
  'dragThreshold',
  'keyboardStep',
  'selectedId',
  'acceptTransfers',
] as const

const EMPTY_LAYOUT: GridLayout = {
  canvas: {
    width: 0,
    height: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    heightMode: 'bounded',
  },
  items: [],
}

/** The state the server renders and the client resumes from: the layout at its authored size. */
function initialState<TData>(props: GridProviderProps<TData>): GridState<TData> {
  const source = (props.layout ??
    props.defaultLayout ??
    (EMPTY_LAYOUT as GridLayout<TData>)) as GridLayout<TData>
  const config = resolveControllerConfig<TData>({
    gap: props.gap,
    snapDistance: props.snapDistance,
    snap: props.snap,
    responsive: props.responsive,
    dragThreshold: props.dragThreshold,
    keyboardStep: props.keyboardStep,
  })
  return {
    source,
    size: null,
    layout: renderLayout(source, null, config),
    interaction: null,
    activeRect: null,
    preview: null,
    selectedId: props.selectedId ?? null,
    transferring: false,
  }
}

/**
 * Owns layout state and gesture state for one canvas. Place a `GridCanvas`
 * inside it. The server renders the layout at its authored size from props
 * alone; on the client a `GridController` from `gridla/interaction` is created
 * once the provider is visible and mirrors its store into a signal.
 */
export const GridProvider = component$<GridProviderProps>((props) => {
  const id = useId()
  const state = useSignal<GridState>(() => initialState(props))
  const runtime = useStore<GridRuntime>({
    id: `gridla-qwik-${id}`,
    responsive: props.responsive ?? true,
    controller: undefined,
    scope: undefined,
  })
  const transfer = useContext(TransferScopeContextId, null)
  const value = useConstant<GridContextValue>(() => ({ state, runtime }))
  useContextProvider(GridContextId, value)

  // Forward prop changes to the controller. Runs on the server too, where the
  // controller does not exist yet; the visible task below picks up the props
  // that are current when it mounts.
  useTask$(({ track }) => {
    track(props)
    for (const key of TRACKED_PROPS) track(() => props[key])
    runtime.responsive = props.responsive ?? true
    runtime.controller?.setOptions(controllerOptions(props, runtime))
  })

  // eslint-disable-next-line qwik/no-use-visible-task -- the controller needs the DOM
  useVisibleTask$(
    // oxlint-disable-next-line typescript/unbound-method -- task context methods are bound by Qwik
    ({ cleanup }) => {
      if (transfer) {
        transfer.scope ??= noSerialize(createTransferScope())
        runtime.scope = transfer.scope
      }
      const controller = createGridController(controllerOptions(props, runtime))
      state.value = controller.store.getSnapshot()
      cleanup(
        controller.store.subscribe(() => {
          state.value = controller.store.getSnapshot()
        }),
      )
      runtime.controller = noSerialize(controller)
      cleanup(() => {
        runtime.controller = undefined
        controller.destroy()
      })
    },
    { strategy: 'document-ready' },
  )

  return <Slot />
})
