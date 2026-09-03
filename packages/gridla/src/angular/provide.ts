import {
  InjectionToken,
  makeEnvironmentProviders,
  type EnvironmentProviders,
  type Provider,
} from '@angular/core'

import { createTransferScope, type TransferScope } from 'gridla/interaction'
import type { GridlaOptions } from './types'

/**
 * Injection token for the application-wide defaults registered with
 * `provideGridla`. Inject it to read the defaults; provide it directly when
 * `provideGridla` is not an option (for example inside a component's
 * `providers` array).
 */
export const GRIDLA_OPTIONS = new InjectionToken<GridlaOptions>('gridla.options')

/**
 * Injection token for the `TransferScope` a provider registers with.
 * `GridTransferScopeComponent` provides it; inject it optionally to
 * participate in transfers from custom code.
 */
export const GRID_TRANSFER_SCOPE = new InjectionToken<TransferScope>('gridla.transferScope')

/**
 * Register application-wide defaults for every `gridlaProvider`: solver
 * options (`gap`, `snapDistance`, `snap`, `onTrace`) plus `responsive`,
 * `dragThreshold`, and `keyboardStep`. Add it to `bootstrapApplication` or a
 * route's `providers`. Optional: providers work without it.
 */
export function provideGridla(options: GridlaOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: GRIDLA_OPTIONS, useValue: options }])
}

/**
 * Providers for a transfer scope. `GridTransferScopeComponent` uses this; add
 * it to a component's `providers` to make every `gridlaProvider` inside that
 * component share one scope without an extra element.
 */
export function provideGridTransferScope(): Provider[] {
  return [{ provide: GRID_TRANSFER_SCOPE, useFactory: createTransferScope }]
}
