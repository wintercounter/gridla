import {
  createComponent,
  createMemo,
  createRenderEffect,
  onCleanup,
  splitProps,
  untrack,
  type JSX,
} from 'solid-js'

import type { GridItem, GridLayout, SolveOptions } from '../core'
import {
  createGridController,
  resolveControllerConfig,
  type GridControllerOptions,
} from '../interaction/controller'
import type { GridChangeDetail } from '../interaction/types'
import { GridContext, useTransferScope, type GridContextValue } from './context'

/**
 * Props for `GridProvider`: every `SolveOptions` field, a controlled or
 * uncontrolled layout, change and transfer callbacks, and the settings that
 * make up `GridProviderConfig`.
 */
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
  /** Project the layout onto the measured canvas size. Default `true`. */
  responsive?: boolean
  /** Minimum pointer travel before a press becomes a drag. Default `4`. */
  dragThreshold?: number
  /** Pixels moved per arrow key press. Default `8`. */
  keyboardStep?: number
  /** Controlled selection. */
  selectedId?: string | null
  onSelectedIdChange?: (itemId: string | null) => void
  children?: JSX.Element
}

/**
 * Owns layout and gesture state for one canvas. Place a `GridCanvas` inside
 * it. Props are read reactively: changing `layout`, a callback, or a solver
 * option forwards to the controller without remounting. A binding over
 * `createGridController` from `gridla/interaction`.
 */
export function GridProvider<TData = unknown>(props: GridProviderProps<TData>): JSX.Element {
  const [local, rest] = splitProps(props, ['children'])
  const scope = useTransferScope()
  const options = (): GridControllerOptions<TData> => ({ ...rest, scope })

  const controller = createGridController<TData>(untrack(options))
  createRenderEffect(() => controller.setOptions(options()))
  onCleanup(() => controller.destroy())

  const config = createMemo(() => resolveControllerConfig(options()))
  const value: GridContextValue<TData> = {
    id: controller.id,
    store: controller.store,
    actions: controller.actions,
    config,
    gesture: controller.gesture,
    controller,
  }

  return createComponent(GridContext.Provider, {
    value: value as unknown as GridContextValue,
    get children() {
      return local.children
    },
  })
}
