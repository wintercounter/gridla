/**
 * Hero animation: an asymmetric layout with a nested group is projected onto
 * a narrower canvas and back, then a cursor appears, drags the small card
 * across into the group (its sibling slides aside), drops it, and fades.
 *
 * Pure CSS keyframes on a contained box (see `styles.css`, "Reflow"). Under
 * `prefers-reduced-motion` every animation is disabled and the base styles
 * paint the final frame.
 */
export function Reflow() {
  return (
    <figure
      className="g-reflow"
      aria-label="An asymmetric layout with a nested group reflows as its canvas narrows, then a cursor drags a card into the group while its sibling slides aside"
    >
      <div className="g-reflow-canvas">
        <div className="g-reflow-cell" data-role="tall" />
        <div className="g-reflow-cell" data-role="wide" />
        <div className="g-reflow-cell" data-role="group">
          <div className="g-reflow-cell" data-role="g1" />
          <div className="g-reflow-cell" data-role="g2" />
          <div className="g-reflow-cell" data-role="g3" />
          <div className="g-reflow-guide" />
        </div>
        <div className="g-reflow-cell" data-role="small" />
        <div className="g-reflow-cursor" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              d="M5.5 3.5 19 12.2l-6.1 1.3-3 5.6z"
              fill="var(--g-bg-inverse)"
              stroke="var(--g-bg)"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
      <figcaption className="g-reflow-label">
        <span data-phase="project">projectLayout · chain</span>
        <span data-phase="move">moveItem · push-x</span>
      </figcaption>
    </figure>
  )
}
