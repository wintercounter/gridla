# gridla

## 0.2.1

### Patch Changes

- [`62b69a0`](https://github.com/wintercounter/gridla/commit/62b69a0b7a48192c2ce5047b79b97700a82efe8a) Thanks [@wintercounter](https://github.com/wintercounter)! - Resize handle geometry uses the `--gridla-handle-size`, `--gridla-handle-inset`, and `--gridla-handle-cursor[-<edge>]` custom properties, so stylesheets size and restyle the built-in handles without `!important`. The shared `resizeHandleStyle`, `rectStyle`, and `styleToText` helpers are exported from `gridla/interaction` and back every adapter. New `gridla/base.css` starter stylesheet, and a styling guide in the docs.

## 0.2.0

### Minor Changes

- [`1c315c0`](https://github.com/wintercounter/gridla/commit/1c315c0b17a79ca892d2bad4a5a03f1d02c8e6c0) Thanks [@wintercounter](https://github.com/wintercounter)! - Framework adapters. Every adapter is a subpath of the `gridla` package, built on the new framework-neutral interaction layer, with the framework as an optional peer dependency and the same names, props, and `data-gridla-*` attributes as `gridla/react`.
  
  - `gridla/interaction`: the layer `gridla/react` is now built on (`createGridController`, `createPointerGesture` with `bindPointer`/`bindKeyboard`, `createTransferScope`, `observeSize`, `createGridStore`, `renderLayout`, `GRID_DATA`, and the interaction types). The React API is unchanged.
  - `gridla/dom`: `mountGrid(element, options)` returns a `GridHandle`; vanilla, no framework.
  - `gridla/elements`: `<gridla-canvas>`, `<gridla-item>`, `<gridla-preview>`, `<gridla-transfer-scope>` custom elements over `gridla/dom`, registered with `defineGridlaElements()`.
  - `gridla/vue`: Vue 3 components (`v-model:layout`) and composables.
  - `gridla/svelte`: Svelte 5 components (`bind:layout`) and rune-style readers; shipped as Svelte source with a `svelte` export condition.
  - `gridla/solid`: Solid components and primitives, hyperscript on the client and `ssrElement` on the server.
  - `gridla/angular`: standalone components and directives with signals (`[(layout)]`), compiled with ng-packagr.
  - `gridla/qwik`: resumable components with `$`-suffixed callbacks; the controller is created on the client.
  - Preact: `gridla/react` runs on `preact/compat` unchanged; the alias setup is documented and verified by the package contract suite.

### Patch Changes

- [`1f52e0d`](https://github.com/wintercounter/gridla/commit/1f52e0d5456ac753437f7d02490651ed66c56ec0) Thanks [@wintercounter](https://github.com/wintercounter)! - `applyGap` now reads the existing spacing from the layout: any neighbor distance up to 64px counts as a gap, so layouts authored with 16px (or any other scale) re-space on both axes without passing `recognizedGaps`. Previously only `0, 1, 6, 12, 18` were recognized and a 16px layout kept its vertical spacing.

- [`1fd83e1`](https://github.com/wintercounter/gridla/commit/1fd83e13168a98fbd5a4a9f844d18eb0f201c539) Thanks [@wintercounter](https://github.com/wintercounter)! - Controlled providers now render an accepted change immediately instead of waiting for the owner to pass the layout back. Passing the emitted layout back is a no-op; passing a different layout still overrides. Frameworks that apply props on a scheduled change-detection tick (Angular, Vue, Svelte, Solid, Qwik) no longer lose a second gesture that lands inside that tick.

- [`46b3420`](https://github.com/wintercounter/gridla/commit/46b3420a524a4a7edd28e01347e33cd4ce58b9c2) Thanks [@wintercounter](https://github.com/wintercounter)! - React adapter: while a dragged item is previewed in another canvas of a `GridTransferScope`, the source canvas no longer keeps its own move preview. Siblings settle back to their resting positions and `GridPreviewOutline` disappears there until the pointer returns.

- [`18956ff`](https://github.com/wintercounter/gridla/commit/18956ffe63b5f0f7a8b7cc6e5aee3d1927a22193) Thanks [@wintercounter](https://github.com/wintercounter)! - React adapter: `GridTransferScope` no longer flips between a target and the drag source when the target's drop preview pushes the source canvas under the pointer. Hit-testing now uses each canvas' resting position, so dropping into the gap between two groups keeps the outer canvas as the target instead of oscillating.

## 0.1.0

### Minor Changes

- [`e288780`](https://github.com/wintercounter/gridla/commit/e28878029bf86379f5fb3fead2f8a311d9f02861) Thanks [@wintercounter](https://github.com/wintercounter)! - Initial public release: framework-neutral core (`moveItem`, `resizeItem`,
  `placeItem`, `transferItem`, `projectLayout`, `applyGap`, `flattenLayout`,
  `compactLayout`, `applyPreset`) and the React adapter (`GridProvider`,
  `GridCanvas`, `GridItem`, `GridPreviewOutline`, `GridTransferScope`, hooks).
  
  Behavior: solvers honor fixed-size axes of bystanders, rejected results return the input layout, overlapping pointer placements are reported as rejected, and chain projection groups items into lanes so rows stay aligned under any canvas size.
