import { useState, type ReactNode } from 'react'

import { createTransferScope } from '../interaction/transfer'
import { TransferScopeContext } from './transfer-context'

/**
 * Lets items move between every `GridProvider` rendered inside it. The
 * pointer decides the target: the deepest registered canvas under the pointer
 * that accepts the item previews the drop; releasing there commits it.
 * Wraps a `TransferScope` from `gridla/interaction` in context.
 */
export function GridTransferScope({ children }: { children?: ReactNode }) {
  const [scope] = useState(createTransferScope)
  return <TransferScopeContext.Provider value={scope}>{children}</TransferScopeContext.Provider>
}
