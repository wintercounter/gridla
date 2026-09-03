/** @jsxImportSource @builder.io/qwik */
import { component$, Slot, useContextProvider, useStore } from '@builder.io/qwik'

import { TransferScopeContextId, type TransferContextValue } from './context'

/**
 * Lets items move between every `GridProvider` rendered inside it. The
 * pointer decides the target: the deepest registered canvas under the pointer
 * that accepts the item previews the drop; releasing there commits it. The
 * underlying `TransferScope` from `gridla/interaction` is created on the
 * client by the first provider that mounts.
 */
export const GridTransferScope = component$(() => {
  const transfer = useStore<TransferContextValue>({ scope: undefined })
  useContextProvider(TransferScopeContextId, transfer)
  return <Slot />
})
