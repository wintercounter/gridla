import { defineComponent, provide, type SlotsType, type VNode } from 'vue'

import { createTransferScope } from '../interaction/transfer'
import { TRANSFER_SCOPE_KEY } from './context'

/**
 * Lets items move between every `GridProvider` rendered inside it. The
 * pointer decides the target: the deepest registered canvas under the pointer
 * that accepts the item previews the drop; releasing there commits it.
 * Provides a `TransferScope` from `gridla/interaction`; renders only its
 * default slot.
 */
export const GridTransferScope = defineComponent({
  name: 'GridTransferScope',
  slots: Object as SlotsType<{ default?: () => VNode[] }>,
  setup(_, { slots }) {
    provide(TRANSFER_SCOPE_KEY, createTransferScope())
    return () => slots.default?.() ?? null
  },
})
