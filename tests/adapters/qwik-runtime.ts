/**
 * Runtime flags for `@builder.io/qwik` when its optimizer has not run: the
 * adapter source keeps its `$` calls, so `$()` must create QRLs at runtime.
 * Read once when the core module evaluates, so import this file first.
 */
export const QWIK_RUNTIME_FLAGS = { qRuntimeQrl: true, qTest: true } as const

Object.assign(globalThis, QWIK_RUNTIME_FLAGS)
