import { appHref } from '../site'

export type DemoProps = {
  /** Gallery demo id, for example `responsive-projection`. */
  id: string
  /** Accessible name of the embedded frame. */
  title: string
  /** Frame height as a CSS length. Default `34rem`. */
  height?: string
}

/**
 * Embeds one gallery demo. The gallery is a separate app served beneath the
 * site base path and routes with `#/<demo-id>`; this component only frames
 * it, so the docs never depend on the gallery source.
 */
export function Demo({ id, title, height }: DemoProps) {
  const src = appHref('gallery', id)
  return (
    <figure
      className="g-demo"
      style={height ? { ['--g-demo-height' as string]: height } : undefined}
    >
      <figcaption className="g-demo-bar">
        <span>demo · {id}</span>
        <a href={src}>Open full size</a>
      </figcaption>
      {/* The gallery is a same-origin app we publish alongside the site; a
          sandbox that allows both scripts and same-origin is no sandbox. */}
      {/* oxlint-disable-next-line react/iframe-missing-sandbox */}
      <iframe src={src} loading="lazy" title={title} />
    </figure>
  )
}
