import * as fs from 'node:fs'
import * as path from 'node:path'

import { defineConfig } from '@rspress/core'
import { pluginLlms } from '@rspress/plugin-llms'
import { pluginSitemap } from '@rspress/plugin-sitemap'

const BASE = '/gridla/'
const ORIGIN = 'https://wintercounter.github.io'
const SITE_URL = `${ORIGIN}${BASE}`
/** Library version, read at build time and shown in the site footer. */
const VERSION: string = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../packages/gridla/package.json'), 'utf8'),
).version
const DESCRIPTION =
  'Pixel-precise grids and nested layouts. A framework-neutral layout engine with move, resize, place, and transfer solving, responsive projection, and adapters for React, Vue, Svelte, Solid, Angular, Qwik, Web Components, and the DOM.'

export default defineConfig({
  root: path.join(__dirname, 'docs'),
  base: BASE,
  siteOrigin: ORIGIN,
  title: 'Gridla',
  description: DESCRIPTION,
  lang: 'en',
  icon: '/favicon.svg',
  logo: '/mark.svg',
  logoText: 'gridla',
  outDir: 'doc_build',
  head: [
    ['meta', { name: 'theme-color', content: '#1D2033' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'Gridla' }],
    ['meta', { property: 'og:image', content: `${SITE_URL}social-card.svg` }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    [
      'meta',
      { property: 'og:image:alt', content: 'gridla. Pixel-precise grids and nested layouts.' },
    ],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: `${SITE_URL}social-card.svg` }],
    (route) => {
      const clean = route.routePath.replace(/index\.html$/, '').replace(/\.html$/, '.html')
      const canonical = `${ORIGIN}${clean.startsWith(BASE) ? clean : `${BASE}${clean.replace(/^\//, '')}`}`
      return ['link', { rel: 'canonical', href: canonical }]
    },
    (route) => {
      const clean = route.routePath.replace(/index\.html$/, '')
      const url = `${ORIGIN}${clean.startsWith(BASE) ? clean : `${BASE}${clean.replace(/^\//, '')}`}`
      return ['meta', { property: 'og:url', content: url }]
    },
  ],
  route: {
    cleanUrls: false,
  },
  markdown: {
    showLineNumbers: false,
    defaultWrapCode: false,
    link: { checkDeadLinks: true },
  },
  search: { codeBlocks: true },
  themeConfig: {
    darkMode: true,
    enableScrollToTop: true,
    lastUpdated: false,
    socialLinks: [
      { icon: 'github', mode: 'link', content: 'https://github.com/wintercounter/gridla' },
      { icon: 'npm', mode: 'link', content: 'https://www.npmjs.com/package/gridla' },
    ],
    nav: [
      {
        text: 'Guide',
        link: '/getting-started/install',
        activeMatch: '^/(getting-started|adapters|concepts|recipes|guides)/',
        position: 'left',
      },
      { text: 'API', link: '/api/', activeMatch: '^/api/', position: 'left' },
    ],
    sidebar: {
      '/api/': [
        { text: 'Overview', link: '/api/' },
        {
          text: 'Core',
          items: [
            { text: 'Model', link: '/api/core/model' },
            { text: 'Geometry', link: '/api/core/geometry' },
            { text: 'Projection', link: '/api/core/projection' },
            { text: 'Solvers', link: '/api/core/solvers' },
            { text: 'Nested', link: '/api/core/nested' },
            { text: 'Presets', link: '/api/core/presets' },
            { text: 'Instrumentation', link: '/api/core/instrumentation' },
          ],
        },
        {
          text: 'Interaction',
          items: [
            { text: 'Controller', link: '/api/interaction/controller' },
            { text: 'Pointer gesture', link: '/api/interaction/gesture' },
            { text: 'Transfer scope', link: '/api/interaction/transfer' },
            { text: 'Style helpers', link: '/api/interaction/style' },
            { text: 'Types', link: '/api/interaction/types' },
          ],
        },
        {
          text: 'React',
          items: [
            { text: 'Provider', link: '/api/react/provider' },
            { text: 'Components', link: '/api/react/components' },
            { text: 'Hooks', link: '/api/react/hooks' },
            { text: 'Interaction', link: '/api/react/interaction' },
            { text: 'Transfer scope', link: '/api/react/transfer' },
            { text: 'Types', link: '/api/react/types' },
          ],
        },
        {
          text: 'Svelte',
          items: [
            { text: 'Components', link: '/api/svelte/components' },
            { text: 'Runes', link: '/api/svelte/runes' },
            { text: 'Types', link: '/api/svelte/types' },
          ],
        },
        {
          text: 'DOM',
          items: [
            { text: 'Mount', link: '/api/dom/mount' },
            { text: 'Types', link: '/api/dom/types' },
          ],
        },
        {
          text: 'Web Components',
          items: [
            { text: 'Elements', link: '/api/elements/elements' },
            { text: 'Types', link: '/api/elements/types' },
          ],
        },
        {
          text: 'Solid',
          items: [
            { text: 'Provider', link: '/api/solid/provider' },
            { text: 'Components', link: '/api/solid/components' },
            { text: 'Primitives', link: '/api/solid/primitives' },
            { text: 'Transfer scope', link: '/api/solid/transfer' },
            { text: 'Types', link: '/api/solid/types' },
          ],
        },
        {
          text: 'Angular',
          items: [
            { text: 'Provider', link: '/api/angular/provider' },
            { text: 'Components', link: '/api/angular/components' },
            { text: 'Signals', link: '/api/angular/signals' },
            { text: 'Types', link: '/api/angular/types' },
          ],
        },
        {
          text: 'Vue',
          items: [
            { text: 'Provider', link: '/api/vue/provider' },
            { text: 'Components', link: '/api/vue/components' },
            { text: 'Composables', link: '/api/vue/composables' },
            { text: 'Transfer scope', link: '/api/vue/transfer' },
            { text: 'Types', link: '/api/vue/types' },
          ],
        },
        {
          text: 'Qwik',
          items: [
            { text: 'Provider', link: '/api/qwik/provider' },
            { text: 'Components', link: '/api/qwik/components' },
            { text: 'Hooks', link: '/api/qwik/hooks' },
            { text: 'Transfer scope', link: '/api/qwik/transfer' },
            { text: 'Types', link: '/api/qwik/types' },
          ],
        },
      ],
      '/': [
        {
          text: 'Getting started',
          items: [
            { text: 'Install', link: '/getting-started/install' },
            { text: 'Vanilla quickstart', link: '/getting-started/vanilla' },
            { text: 'React quickstart', link: '/getting-started/react' },
          ],
        },
        {
          text: 'Adapters',
          items: [
            { text: 'Overview', link: '/adapters/' },
            { text: 'DOM', link: '/adapters/dom' },
            { text: 'Web Components', link: '/adapters/web-components' },
            { text: 'Vue', link: '/adapters/vue' },
            { text: 'Svelte', link: '/adapters/svelte' },
            { text: 'Solid', link: '/adapters/solid' },
            { text: 'Angular', link: '/adapters/angular' },
            { text: 'Qwik', link: '/adapters/qwik' },
            { text: 'Preact', link: '/adapters/preact' },
          ],
        },
        {
          text: 'Concepts',
          items: [
            { text: 'Mental model', link: '/concepts/mental-model' },
            { text: 'Coordinate systems', link: '/concepts/coordinates' },
            { text: 'Items and constraints', link: '/concepts/items' },
            { text: 'Sizing modes', link: '/concepts/sizing-modes' },
            { text: 'Padding and gaps', link: '/concepts/padding-gaps' },
            { text: 'Projection', link: '/concepts/projection' },
            { text: 'Nesting', link: '/concepts/nesting' },
            { text: 'Solver behavior', link: '/concepts/solver' },
          ],
        },
        {
          text: 'Recipes',
          items: [
            { text: 'Move', link: '/recipes/move' },
            { text: 'Resize', link: '/recipes/resize' },
            { text: 'Place', link: '/recipes/place' },
            { text: 'Transfer', link: '/recipes/transfer' },
            { text: 'Controlled state', link: '/recipes/controlled-state' },
            { text: 'Persistence', link: '/recipes/persistence' },
            { text: 'Keyboard controls', link: '/recipes/keyboard' },
            { text: 'Custom rendering', link: '/recipes/custom-rendering' },
            { text: 'Multiple canvases', link: '/recipes/multiple-canvases' },
            { text: 'Server rendering', link: '/recipes/ssr' },
          ],
        },
        {
          text: 'Guides',
          items: [
            { text: 'Styling', link: '/guides/styling' },
            { text: 'Architecture', link: '/guides/architecture' },
            { text: 'Accessibility', link: '/guides/accessibility' },
            { text: 'Performance', link: '/guides/performance' },
            { text: 'Browser support', link: '/guides/browser-support' },
            { text: 'SSR', link: '/guides/ssr' },
            { text: 'Troubleshooting', link: '/guides/troubleshooting' },
            { text: 'Migration and versioning', link: '/guides/migration' },
            { text: 'Contributor notes', link: '/guides/contributing' },
            { text: 'Adding solver fixtures', link: '/guides/solver-fixtures' },
            { text: 'Changelog', link: '/guides/changelog' },
          ],
        },
      ],
    },
  },
  plugins: [
    pluginSitemap({ siteUrl: SITE_URL, defaultChangeFreq: 'weekly', defaultPriority: '0.6' }),
    pluginLlms({
      llmsTxt: { name: 'llms.txt' },
      llmsFullTxt: { name: 'llms-full.txt' },
      mdFiles: { mdxToMd: true },
    }),
  ],
  builderConfig: {
    source: {
      define: {
        'process.env.GRIDLA_VERSION': JSON.stringify(VERSION),
      },
    },
    html: {
      meta: {
        'og:title': 'Gridla',
        'og:description': DESCRIPTION,
      },
    },
  },
})
