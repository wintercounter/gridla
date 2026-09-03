# gridla

Pixel-precise grids and nested layouts that move, resize, snap, and reflow.
A framework-neutral engine with zero runtime dependencies and adapters for
React, Vue, Svelte, Solid, Angular, Qwik, Web Components, and the DOM.

```sh
npm install gridla
```

```ts
import { createItem, moveItem, projectLayout } from 'gridla'

const layout = {
  canvas: {
    width: 960,
    height: 600,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    heightMode: 'bounded',
  },
  items: [
    createItem('chart', { w: 480, h: 300, minW: 160 }, 0, 0),
    createItem('sidebar', { w: 480, h: 300, minW: 160 }, 480, 0),
  ],
}

const result = moveItem({
  layout,
  itemId: 'chart',
  position: { x: 480, y: 0 },
  options: { gap: 12 },
})
result.strategy // 'push-x'
const narrow = projectLayout(result.layout, { width: 640, height: 400 }, { gap: 12 })
```

```tsx
import { GridProvider, GridCanvas, GridItem } from 'gridla/react'

;<GridProvider layout={layout} onLayoutChange={setLayout} gap={12}>
  <GridCanvas style={{ height: 480 }}>
    {layout.items.map((item) => (
      <GridItem key={item.id} id={item.id} resizeEdges={['e', 's', 'se']} />
    ))}
  </GridCanvas>
</GridProvider>
```

## Adapters

One package, one subpath per framework; the framework is an optional peer.

| Framework      | Import            | Docs                                                                  |
| -------------- | ----------------- | --------------------------------------------------------------------- |
| React          | `gridla/react`    | <https://wintercounter.github.io/gridla/getting-started/react.html>   |
| Vue            | `gridla/vue`      | <https://wintercounter.github.io/gridla/adapters/vue.html>            |
| Svelte         | `gridla/svelte`   | <https://wintercounter.github.io/gridla/adapters/svelte.html>         |
| Solid          | `gridla/solid`    | <https://wintercounter.github.io/gridla/adapters/solid.html>          |
| Angular        | `gridla/angular`  | <https://wintercounter.github.io/gridla/adapters/angular.html>        |
| Qwik           | `gridla/qwik`     | <https://wintercounter.github.io/gridla/adapters/qwik.html>           |
| Web Components | `gridla/elements` | <https://wintercounter.github.io/gridla/adapters/web-components.html> |
| DOM (vanilla)  | `gridla/dom`      | <https://wintercounter.github.io/gridla/adapters/dom.html>            |
| Preact         | `gridla/react`    | <https://wintercounter.github.io/gridla/adapters/preact.html>         |

- Documentation: https://wintercounter.github.io/gridla/
- Gallery: https://wintercounter.github.io/gridla/gallery/
- Studio: https://wintercounter.github.io/gridla/studio/
- Source and issues: https://github.com/wintercounter/gridla

MIT © Viktor Vincze
