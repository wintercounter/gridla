import { describe, expect, it } from 'bun:test'
import { renderToString } from 'react-dom/server'

import { createItem } from 'gridla'
import { GridCanvas, GridItem, GridProvider } from 'gridla/react'

describe('server rendering', () => {
  it('renders items at their layout positions without a DOM', () => {
    const html = renderToString(
      <GridProvider
        defaultLayout={{
          canvas: {
            width: 800,
            height: 400,
            padding: { top: 0, right: 0, bottom: 0, left: 0 },
            heightMode: 'bounded',
          },
          items: [createItem('a', { w: 200, h: 100 }, 20, 30)],
        }}
      >
        <GridCanvas>
          <GridItem id="a">hello</GridItem>
        </GridCanvas>
      </GridProvider>,
    )
    expect(html).toContain('data-gridla-canvas')
    expect(html).toContain('translate(20px, 30px)')
    expect(html).toContain('hello')
  })

  it('does not touch browser globals on import', async () => {
    const proc = Bun.spawnSync(
      [
        'bun',
        '-e',
        "import('./packages/gridla/src/index.ts').then(() => import('./packages/gridla/src/react.ts')).then((m) => console.log(Object.keys(m).length))",
      ],
      { cwd: `${import.meta.dir}/../..`, env: { ...process.env, BUN_CONFIG_PRELOAD: '' } },
    )
    expect(proc.exitCode).toBe(0)
    expect(Number(proc.stdout.toString().trim())).toBeGreaterThan(10)
  })
})
