import type { ReactNode } from 'react'

/** Frame for an inline SVG diagram with a caption. */
export function Figure({ caption, children }: { caption?: string; children: ReactNode }) {
  return (
    <figure className="g-figure">
      {children}
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  )
}
