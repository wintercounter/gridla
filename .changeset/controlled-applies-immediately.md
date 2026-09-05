---
'gridla': patch
---

Controlled providers now render an accepted change immediately instead of waiting for the owner to pass the layout back. Passing the emitted layout back is a no-op; passing a different layout still overrides. Frameworks that apply props on a scheduled change-detection tick (Angular, Vue, Svelte, Solid, Qwik) no longer lose a second gesture that lands inside that tick.
