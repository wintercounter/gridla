/**
 * Stand-in for the `@qwik-client-manifest` virtual module that the Qwik Vite
 * plugin provides to `@builder.io/qwik/server`. Without a client build there
 * is no manifest; `renderToString` falls back to symbol names.
 */
export const manifest = undefined
