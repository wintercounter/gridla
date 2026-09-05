/**
 * Server-rendering probe for `gridla/solid`, run as a subprocess by
 * `solid.test.ts`. Bun resolves `solid-js` with the `node` condition, so this
 * process gets Solid's server build; the test process swaps in the browser
 * build, and the two cannot share one module registry. Components are
 * composed with `createComponent`, as compiled JSX does on the server
 * (`solid-js/h` is a client-only runtime). Prints the rendered markup as JSON.
 */
import { createItem, type GridLayout } from 'gridla'
import { createComponent, renderToString } from 'solid-js/web'

import { GridCanvas, GridItem, GridPreviewOutline, GridProvider } from 'gridla/solid'

const padding = { top: 0, right: 0, bottom: 0, left: 0 }
const layout: GridLayout<{ label: string }> = {
  canvas: { width: 1000, height: 600, padding, heightMode: 'bounded' },
  items: [
    createItem('a', { w: 500, h: 300 }, 0, 0, { label: 'A <em>one</em>' }),
    createItem('b', { w: 500, h: 300 }, 500, 0, { label: 'B' }),
  ],
}

const html = renderToString(() =>
  createComponent(GridProvider, {
    defaultLayout: layout,
    gap: 12,
    get children() {
      return createComponent(GridCanvas, {
        class: 'stage',
        style: { height: '480px' },
        get children() {
          return [
            ...layout.items.map((item) =>
              createComponent(GridItem, {
                id: item.id,
                resizeEdges: ['e', 's', 'se'],
                children: item.data?.label,
              }),
            ),
            createComponent(GridPreviewOutline, {}),
          ]
        },
      })
    },
  }),
)

process.stdout.write(JSON.stringify({ html }))
