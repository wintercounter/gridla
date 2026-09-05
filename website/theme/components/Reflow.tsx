/**
 * A nested layout reflowing between two canvas widths. Pure CSS keyframes on
 * layout-affecting properties inside a contained box; stops entirely under
 * `prefers-reduced-motion`.
 */
export function Reflow() {
  return (
    <figure
      className="g-reflow"
      aria-label="A dashboard layout with a header, a sidebar, and a nested group of chart and stat cards reflowing as the canvas narrows"
    >
      <div className="g-reflow-canvas">
        <div className="g-reflow-cell" data-role="header" />
        <div className="g-reflow-cell" data-role="sidebar" />
        <div className="g-reflow-cell" data-role="group">
          <div className="g-reflow-cell" data-role="chart" />
          <div className="g-reflow-cell" data-role="stat-1" />
          <div className="g-reflow-cell" data-role="stat-2" />
        </div>
        <div className="g-reflow-guide" data-axis="x" />
      </div>
      <figcaption className="g-reflow-label">projectLayout · chain</figcaption>
    </figure>
  )
}
