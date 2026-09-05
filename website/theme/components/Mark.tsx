/** The Gridla mark as inline SVG so it follows `currentColor` and the accent token. */
export function Mark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <g fill="currentColor">
        <rect x="6" y="6" width="14" height="14" rx="2" />
        <rect x="25" y="6" width="14" height="14" rx="2" />
        <rect x="44" y="6" width="14" height="14" rx="2" />
        <rect x="6" y="25" width="14" height="14" rx="2" />
        <rect x="6" y="44" width="14" height="14" rx="2" />
        <rect x="44" y="44" width="14" height="14" rx="2" />
        <rect x="25" y="44" width="14" height="14" rx="2" />
      </g>
      <rect x="25" y="25" width="33" height="14" rx="2" fill="var(--g-accent, #e0562f)" />
    </svg>
  )
}
