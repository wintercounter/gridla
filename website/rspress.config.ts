import * as path from 'node:path'

import { defineConfig } from '@rspress/core'
import { pluginLlms } from '@rspress/plugin-llms'
import { pluginSitemap } from '@rspress/plugin-sitemap'

const BASE = '/gridla/'
const ORIGIN = 'https://wintercounter.github.io'
const SITE_URL = `${ORIGIN}${BASE}`
const DESCRIPTION =
  'Pixel-precise grids and nested layouts. A framework-neutral layout engine with move, resize, place, and transfer solving, responsive projection, and an optional React adapter.'

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
    footer: {
      message: 'Gridla is MIT licensed. Hand-authored assets; no generated raster images.',
    },
    socialLinks: [
      { icon: 'github', mode: 'link', content: 'https://github.com/wintercounter/gridla' },
      { icon: 'npm', mode: 'link', content: 'https://www.npmjs.com/package/gridla' },
    ],
    nav: [
      {
        text: 'Guide',
        link: '/getting-started/install',
        activeMatch: '^/(getting-started|concepts|recipes|guides)/',
      },
      { text: 'API', link: '/api/', activeMatch: '^/api/' },
      { text: 'Playground', link: '/playground', activeMatch: '^/playground' },
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
        { text: 'Playground', link: '/playground' },
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
    html: {
      meta: {
        'og:title': 'Gridla',
        'og:description': DESCRIPTION,
      },
    },
  },
})
