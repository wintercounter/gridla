/**
 * Registers a DOM for `bun test`. Tests that need a server-like environment
 * can call `GlobalRegistrator.unregister()` and re-register afterwards.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator'

if (typeof document === 'undefined') {
  GlobalRegistrator.register()
}
