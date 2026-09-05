import { createContext, useContext } from 'react'

import type { TransferScope } from '../interaction/transfer'

export const TransferScopeContext = createContext<TransferScope | null>(null)

export function useTransferScope(): TransferScope | null {
  return useContext(TransferScopeContext)
}
