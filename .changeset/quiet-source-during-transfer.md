---
'gridla': patch
---

React adapter: while a dragged item is previewed in another canvas of a `GridTransferScope`, the source canvas no longer keeps its own move preview. Siblings settle back to their resting positions and `GridPreviewOutline` disappears there until the pointer returns.
