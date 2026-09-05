---
'gridla': patch
---

React adapter: `GridTransferScope` no longer flips between a target and the drag source when the target's drop preview pushes the source canvas under the pointer. Hit-testing now uses each canvas' resting position, so dropping into the gap between two groups keeps the outer canvas as the target instead of oscillating.
