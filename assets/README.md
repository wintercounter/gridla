# Assets

- `mark.svg` — the Gridla mark. Uses `currentColor` for the cells so it follows the theme; the moving cell is the accent.
- `wordmark.svg` / `wordmark-dark.svg` — mark plus name with explicit ink for light and dark surfaces (the README uses a `<picture>` to switch). Mark plus name. The name is live text set in Familjen Grotesk with system fallbacks.
- `favicon.svg` — ink tile with the mark in paper and accent.
- `social-card.svg` — 1200x630 social preview.

All assets are hand-authored SVG. No generated raster images are used.
- `size-badge.json` — shields.io endpoint data for the README size badge; written by `bun run scripts/check-size.ts --update`.
