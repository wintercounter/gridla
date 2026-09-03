import { createComponent, type JSX } from 'solid-js'

import { createTransferScope } from '../interaction/transfer'
import { TransferScopeContext } from './context'

/**
 * Lets items move between every `GridProvider` rendered inside it. The
 * pointer decides the target: the deepest registered canvas under the pointer
 * that accepts the item previews the drop; releasing there commits it.
 * Wraps a `TransferScope` from `gridla/interaction` in context.
 */
export function GridTransferScope(props: { children?: JSX.Element }): JSX.Element {
  const scope = createTransferScope()
  return createComponent(TransferScopeContext.Provider, {
    value: scope,
    get children() {
      return props.children
    },
  })
}
