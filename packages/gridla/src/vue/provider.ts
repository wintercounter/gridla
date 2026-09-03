import {
  computed,
  defineComponent,
  onScopeDispose,
  provide,
  useId,
  watch,
  type PropType,
  type SlotsType,
  type VNode,
} from 'vue'

import type { GridItem, GridLayout, SolveOptions, TraceCallback } from '../core'
import {
  createGridController,
  resolveControllerConfig,
  type GridControllerOptions,
} from '../interaction/controller'
import type { GridChangeDetail } from '../interaction/types'
import { GRID_CONTEXT_KEY, useTransferScope, type GridContextValue } from './context'
import type { GridProviderConfig } from './types'

/**
 * Props of `GridProvider`. Every `SolveOptions` field is a prop; `config`
 * bundles them (and `responsive`, `dragThreshold`, `keyboardStep`) as one
 * object, with individual props taking precedence.
 */
export type GridProviderProps<TData = unknown> = SolveOptions & {
  /** Controlled layout. Pair with `v-model:layout` or `@update:layout`. */
  layout?: GridLayout<TData>
  /** Initial layout for uncontrolled use. */
  defaultLayout?: GridLayout<TData>
  /** Solve options and settings as one object. Individual props win. */
  config?: Partial<GridProviderConfig>
  /** Whether items from other canvases may be dropped here. Default `true`. */
  acceptTransfers?: boolean | ((item: GridItem<TData>, sourceId: string) => boolean)
  /** Project the layout onto the measured canvas size. Default `true`. */
  responsive?: boolean
  /** Minimum pointer travel before a press becomes a drag. Default `4`. */
  dragThreshold?: number
  /** Pixels moved per arrow key press. Default `8`. */
  keyboardStep?: number
  /** Controlled selection. Pair with `v-model:selectedId`. */
  selectedId?: string | null
}

/**
 * Events emitted by `GridProvider`. `update:layout` and `update:selectedId`
 * back `v-model:layout` and `v-model:selectedId`; `layoutChange` carries the
 * `GridChangeDetail` as well; `commit` fires on every accepted interactive
 * commit; `transferIn` and `transferOut` report moves between canvases.
 */
export type GridProviderEmits<TData = unknown> = {
  'update:layout': (layout: GridLayout<TData>) => void
  layoutChange: (layout: GridLayout<TData>, detail: GridChangeDetail) => void
  commit: (detail: GridChangeDetail) => void
  'update:selectedId': (itemId: string | null) => void
  transferIn: (item: GridItem<TData>, sourceId: string) => void
  transferOut: (itemId: string, targetId: string) => void
}

/**
 * Owns layout and gesture state for one canvas. Place a `GridCanvas` inside
 * it. Controlled with `v-model:layout` (or `:layout` plus `@update:layout`),
 * uncontrolled with `default-layout`. A binding over `createGridController`
 * from `gridla/interaction`; renders only its default slot.
 */
export const GridProvider = defineComponent({
  name: 'GridProvider',
  props: {
    layout: { type: Object as PropType<GridLayout>, default: undefined },
    defaultLayout: { type: Object as PropType<GridLayout>, default: undefined },
    config: { type: Object as PropType<Partial<GridProviderConfig>>, default: undefined },
    acceptTransfers: {
      type: [Boolean, Function] as PropType<
        boolean | ((item: GridItem<never>, sourceId: string) => boolean)
      >,
      default: undefined,
    },
    responsive: { type: Boolean, default: undefined },
    dragThreshold: { type: Number, default: undefined },
    keyboardStep: { type: Number, default: undefined },
    selectedId: { type: String as PropType<string | null>, default: undefined },
    gap: { type: Number, default: undefined },
    snapDistance: { type: Number, default: undefined },
    snap: { type: Boolean, default: undefined },
    onTrace: {
      type: Function as PropType<TraceCallback>,
      default: undefined,
    },
  },
  // Payloads are typed with `never` data so handlers written for a concrete
  // `GridLayout<Data>` type-check; the component itself is not generic.
  emits: {
    'update:layout': (_layout: GridLayout<never>) => true,
    layoutChange: (_layout: GridLayout<never>, _detail: GridChangeDetail) => true,
    commit: (_detail: GridChangeDetail) => true,
    'update:selectedId': (_itemId: string | null) => true,
    transferIn: (_item: GridItem<never>, _sourceId: string) => true,
    transferOut: (_itemId: string, _targetId: string) => true,
  },
  slots: Object as SlotsType<{ default?: () => VNode[] }>,
  setup(props, { emit, slots }) {
    const id = useId()
    const scope = useTransferScope()

    const options = (): GridControllerOptions => {
      const bundled = props.config ?? {}
      return {
        id,
        scope,
        layout: props.layout,
        defaultLayout: props.defaultLayout,
        acceptTransfers: props.acceptTransfers as GridControllerOptions['acceptTransfers'],
        responsive: props.responsive ?? bundled.responsive,
        dragThreshold: props.dragThreshold ?? bundled.dragThreshold,
        keyboardStep: props.keyboardStep ?? bundled.keyboardStep,
        selectedId: props.selectedId,
        gap: props.gap ?? bundled.gap,
        snapDistance: props.snapDistance ?? bundled.snapDistance,
        snap: props.snap ?? bundled.snap,
        onTrace: props.onTrace ?? bundled.onTrace,
        onLayoutChange: (layout, detail) => {
          emit('update:layout', layout as GridLayout<never>)
          emit('layoutChange', layout as GridLayout<never>, detail)
        },
        onCommit: (detail) => emit('commit', detail),
        onSelectedIdChange: (itemId) => emit('update:selectedId', itemId),
        onTransferIn: (item, sourceId) => emit('transferIn', item as GridItem<never>, sourceId),
        onTransferOut: (itemId, targetId) => emit('transferOut', itemId, targetId),
      }
    }

    const controller = createGridController(options())
    // Forward prop changes synchronously so the store never lags behind the
    // parent's state (the controller ignores unchanged values).
    watch(options, (next) => controller.setOptions(next), { flush: 'sync' })
    onScopeDispose(() => controller.destroy())

    const config = computed(() => resolveControllerConfig(options()))

    const value: GridContextValue = {
      id,
      store: controller.store,
      actions: controller.actions,
      config,
      gesture: controller.gesture,
      controller,
    }
    provide(GRID_CONTEXT_KEY, value)

    return () => slots.default?.() ?? null
  },
})
