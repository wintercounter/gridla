/**
 * Site-wide constants shared by theme components and MDX pages. The base path
 * must match `base` in rspress.config.ts; the gallery and studio are deployed
 * as separate apps beneath it by CI.
 */
export const SITE_BASE = '/gridla/'

export const SITE_ORIGIN = 'https://wintercounter.github.io'

export const REPO_URL = 'https://github.com/wintercounter/gridla'

export type SiteApp = 'gallery' | 'studio'

/** Absolute, base-aware URL of a deployed companion app. */
export function appHref(app: SiteApp, hash?: string): string {
  const path = `${SITE_BASE}${app}/`
  return hash ? `${path}#/${hash}` : path
}
