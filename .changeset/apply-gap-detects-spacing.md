---
'gridla': patch
---

`applyGap` now reads the existing spacing from the layout: any neighbor distance up to 64px counts as a gap, so layouts authored with 16px (or any other scale) re-space on both axes without passing `recognizedGaps`. Previously only `0, 1, 6, 12, 18` were recognized and a 16px layout kept its vertical spacing.
