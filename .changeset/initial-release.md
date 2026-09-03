---
'gridla': minor
---

Initial public release: framework-neutral core (`moveItem`, `resizeItem`,
`placeItem`, `transferItem`, `projectLayout`, `applyGap`, `flattenLayout`,
`compactLayout`, `applyPreset`) and the React adapter (`GridProvider`,
`GridCanvas`, `GridItem`, `GridPreviewOutline`, `GridTransferScope`, hooks).

Behavior: solvers honor fixed-size axes of bystanders, rejected results return the input layout, overlapping pointer placements are reported as rejected, and chain projection groups items into lanes so rows stay aligned under any canvas size.
