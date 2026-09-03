import type { JSX } from 'solid-js'
import h from 'solid-js/h'
import { escape, isServer, ssrElement } from 'solid-js/web'

/**
 * Props for `createElement`: attribute values, or accessors for values that
 * should update reactively. `ref` receives the element on the client.
 */
export type ElementProps = Record<string, unknown>

type Hyperscript = (tag: string, props: ElementProps, children?: unknown) => () => Element

function serverChildren(children: unknown): unknown {
  if (children === null || children === undefined || typeof children === 'boolean') return ''
  if (typeof children === 'function') return serverChildren((children as () => unknown)())
  if (Array.isArray(children)) return children.map(serverChildren)
  if (typeof children === 'string') return escape(children)
  if (typeof children === 'number') return String(children)
  return children
}

/**
 * Create a host element without a compiler: `solid-js/h` hyperscript on the
 * client (function-valued props and children are reactive) and `ssrElement`
 * on the server (accessors are read once). Returns the element itself on the
 * client and the server's string node otherwise.
 */
export function createElement(tag: string, props: ElementProps, children?: unknown): JSX.Element {
  if (isServer) {
    const resolved: ElementProps = {}
    for (const key of Object.keys(props)) {
      if (key === 'ref' || key.startsWith('on')) continue
      const value = props[key]
      const read = typeof value === 'function' ? (value as () => unknown)() : value
      if (read !== undefined) resolved[key] = read
    }
    return ssrElement(
      tag,
      resolved,
      () => serverChildren(children),
      false,
    ) as unknown as JSX.Element
  }
  return (h as unknown as Hyperscript)(tag, props, children)() as unknown as JSX.Element
}
