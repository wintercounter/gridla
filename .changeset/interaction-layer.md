---
'gridla': minor
---

Framework adapters. Every adapter is a subpath of the `gridla` package, built on the new framework-neutral interaction layer, with the framework as an optional peer dependency and the same names, props, and `data-gridla-*` attributes as `gridla/react`.

- `gridla/interaction`: the layer `gridla/react` is now built on (`createGridController`, `createPointerGesture` with `bindPointer`/`bindKeyboard`, `createTransferScope`, `observeSize`, `createGridStore`, `renderLayout`, `GRID_DATA`, and the interaction types). The React API is unchanged.
- `gridla/dom`: `mountGrid(element, options)` returns a `GridHandle`; vanilla, no framework.
- `gridla/elements`: `<gridla-canvas>`, `<gridla-item>`, `<gridla-preview>`, `<gridla-transfer-scope>` custom elements over `gridla/dom`, registered with `defineGridlaElements()`.
- `gridla/vue`: Vue 3 components (`v-model:layout`) and composables.
- `gridla/svelte`: Svelte 5 components (`bind:layout`) and rune-style readers; shipped as Svelte source with a `svelte` export condition.
- `gridla/solid`: Solid components and primitives, hyperscript on the client and `ssrElement` on the server.
- `gridla/angular`: standalone components and directives with signals (`[(layout)]`), compiled with ng-packagr.
- `gridla/qwik`: resumable components with `$`-suffixed callbacks; the controller is created on the client.
- Preact: `gridla/react` runs on `preact/compat` unchanged; the alias setup is documented and verified by the package contract suite.
