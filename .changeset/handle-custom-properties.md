---
'gridla': patch
---

Resize handle geometry uses the `--gridla-handle-size`, `--gridla-handle-inset`, and `--gridla-handle-cursor[-<edge>]` custom properties, so stylesheets size and restyle the built-in handles without `!important`. The shared `resizeHandleStyle`, `rectStyle`, and `styleToText` helpers are exported from `gridla/interaction` and back every adapter. New `gridla/base.css` starter stylesheet, and a styling guide in the docs.
