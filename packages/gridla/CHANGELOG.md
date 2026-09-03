# gridla

## 0.1.0

### Minor Changes

- [`0209e0b`](https://github.com/wintercounter/gridla/commit/0209e0bf85028a27d0678c225f2f3696e7254c80) Thanks [@wintercounter](https://github.com/wintercounter)! - Initial public release: framework-neutral core (`moveItem`, `resizeItem`,
  `placeItem`, `transferItem`, `projectLayout`, `applyGap`, `flattenLayout`,
  `compactLayout`, `applyPreset`) and the React adapter (`GridProvider`,
  `GridCanvas`, `GridItem`, `GridPreviewOutline`, `GridTransferScope`, hooks).
  
  Behavior: solvers honor fixed-size axes of bystanders, rejected results return the input layout, overlapping pointer placements are reported as rejected, and chain projection groups items into lanes so rows stay aligned under any canvas size.
