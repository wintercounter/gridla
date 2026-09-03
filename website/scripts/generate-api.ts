/**
 * Generate the API reference from the library's public declarations.
 *
 * Reads `packages/gridla/src/core/index.ts` and `packages/gridla/src/react/index.ts`
 * with the TypeScript compiler API, resolves every re-exported symbol to its
 * declaration, and emits one MDX page per group under `docs/api/`. The JSDoc
 * on each declaration is the source of truth; the script only adds structure.
 *
 * Run with `bun run generate` from `website/`.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

import ts from 'typescript'

const WEBSITE_DIR = path.resolve(import.meta.dir, '..')
const REPO_DIR = path.resolve(WEBSITE_DIR, '..')
const SRC_DIR = path.join(REPO_DIR, 'packages/gridla/src')
const OUT_DIR = path.join(WEBSITE_DIR, 'docs/api')

type Kind = 'function' | 'component' | 'hook' | 'type' | 'const' | 'class'

type Entry = {
  name: string
  kind: Kind
  summary: string
  doc: string
  signature: string
  members: Member[]
  file: string
  line: number
  documented: boolean
}

type Member = { name: string; type: string; doc: string; optional: boolean }

type Group = {
  id: string
  title: string
  entry: EntryName
  intro: string
  /** Source files (relative to `src/`) whose exports belong to this group. */
  files: string[]
}

const GROUPS: Group[] = [
  {
    id: 'core/model',
    title: 'Model',
    entry: 'core',
    intro:
      'The public data model. Every type is a plain, serializable object; the core never reads or writes anything else. Constants and predicates here are shared by every solver.',
    files: ['core/model.ts'],
  },
  {
    id: 'core/geometry',
    title: 'Geometry',
    entry: 'core',
    intro:
      'Rectangle math, normalization, bounds and clamping, content extent, validation, and gap enforcement. These are the building blocks the solvers are made of, exported so you can build your own.',
    files: ['core/geometry.ts'],
  },
  {
    id: 'core/projection',
    title: 'Projection',
    entry: 'core',
    intro:
      'Re-fit a layout to a different canvas size. `projectLayout` is the entry point; the chain and segment engines and the gap utilities are exported for advanced use.',
    files: ['core/projection/index.ts', 'core/projection/chain.ts', 'core/projection/segments.ts'],
  },
  {
    id: 'core/solvers',
    title: 'Solvers',
    entry: 'core',
    intro:
      'Move, resize, place, and transfer. Each solver takes a layout plus an intent, returns a new layout, and names the strategy that produced it. Inputs are never mutated.',
    files: [
      'core/solver/index.ts',
      'core/solver/shared.ts',
      'core/solver/move.ts',
      'core/solver/resize.ts',
      'core/solver/place.ts',
      'core/solver/transfer.ts',
    ],
  },
  {
    id: 'core/nested',
    title: 'Nested',
    entry: 'core',
    intro:
      'Trees of layouts. `flattenLayout` projects every container into the rectangle its parent assigned it and returns root-relative rectangles; the rest are queries, coordinate conversions, and compaction over that flat result.',
    files: ['core/nested/index.ts'],
  },
  {
    id: 'core/presets',
    title: 'Presets',
    entry: 'core',
    intro: 'Arrange items into rows, columns, or a grid that fills the canvas.',
    files: ['core/presets.ts'],
  },
  {
    id: 'core/instrumentation',
    title: 'Instrumentation',
    entry: 'core',
    intro:
      'Optional tracing. Pass `onTrace` in `SolveOptions` and every solve reports the strategy it used, so you can build debug overlays or log interaction paths without the core owning a logger.',
    files: ['core/instrumentation.ts'],
  },
  {
    id: 'interaction/controller',
    title: 'Controller',
    entry: 'interaction',
    intro:
      '`createGridController` owns layout and gesture state for one canvas without any framework: a store to render from, imperative actions, the gesture API, projection onto the measured size, and controlled or uncontrolled layout sync.',
    files: ['interaction/controller.ts', 'interaction/store.ts', 'interaction/measure.ts'],
  },
  {
    id: 'interaction/gesture',
    title: 'Pointer gesture',
    entry: 'interaction',
    intro:
      'The pointer and keyboard state machine over a minimal event shape: drag threshold, click versus drag, axis lock, snap bypass, resize edges, pointer capture, keyboard nudges. `bindPointer` and `bindKeyboard` attach native listeners.',
    files: ['interaction/gesture.ts', 'interaction/attributes.ts'],
  },
  {
    id: 'interaction/transfer',
    title: 'Transfer scope',
    entry: 'interaction',
    intro:
      'Move items between controllers. `createTransferScope` hit-tests registered canvases against resting rects, previews the drop in the target, and commits it on release.',
    files: ['interaction/transfer.ts'],
  },
  {
    id: 'interaction/style',
    title: 'Style helpers',
    entry: 'interaction',
    intro:
      'The inline geometry every adapter puts on items, preview outlines, and built-in resize handles. `resizeHandleStyle` reads the `--gridla-handle-size`, `--gridla-handle-inset`, and `--gridla-handle-cursor` custom properties so stylesheets can restyle handles; see the [styling guide](../../guides/styling).',
    files: ['interaction/style.ts'],
  },
  {
    id: 'interaction/types',
    title: 'Types',
    entry: 'interaction',
    intro: 'State, action, gesture, and change types shared by the controller and every adapter.',
    files: ['interaction/types.ts'],
  },
  {
    id: 'dom/mount',
    title: 'Mount',
    entry: 'dom',
    intro:
      '`mountGrid` turns an element into a canvas: it creates and positions one element per item, wires pointer and keyboard input, measures the canvas, and reports committed layouts through a `GridHandle`.',
    files: ['dom/mount.ts', 'dom/view.ts', 'interaction/attributes.ts', 'interaction/transfer.ts'],
  },
  {
    id: 'dom/types',
    title: 'Types',
    entry: 'dom',
    intro: 'State and change types re-exported from the interaction layer for DOM consumers.',
    files: ['interaction/types.ts'],
  },
  {
    id: 'elements/elements',
    title: 'Elements',
    entry: 'elements',
    intro:
      'Custom elements over `gridla/dom`: `<gridla-canvas>`, `<gridla-item>`, `<gridla-preview>`, and `<gridla-transfer-scope>`, registered with `defineGridlaElements`. No shadow DOM; your styles apply.',
    files: ['elements/elements.ts', 'interaction/transfer.ts'],
  },
  {
    id: 'elements/types',
    title: 'Types',
    entry: 'elements',
    intro: 'Change types re-exported from the interaction layer for custom element consumers.',
    files: ['interaction/types.ts'],
  },
  {
    id: 'react/provider',
    title: 'Provider',
    entry: 'react',
    intro:
      '`GridProvider` owns layout and gesture state for one canvas. It accepts every `SolveOptions` field as a prop, works controlled or uncontrolled, and exposes actions through context.',
    files: ['react/provider.tsx', 'react/store.ts', 'interaction/store.ts'],
  },
  {
    id: 'react/components',
    title: 'Components',
    entry: 'react',
    intro:
      'Headless building blocks. `GridCanvas` measures itself and wires input; `GridItem` positions one item and exposes drag and resize handles; `GridPreviewOutline` shows where the active item will land.',
    files: ['react/components.tsx'],
  },
  {
    id: 'react/hooks',
    title: 'Hooks',
    entry: 'react',
    intro:
      'Subscribe to slices of provider state with minimal rerenders, read the rendered or visible layout, and reach the imperative actions.',
    files: ['react/hooks.ts', 'react/context.ts', 'react/measure.ts'],
  },
  {
    id: 'react/interaction',
    title: 'Interaction',
    entry: 'react',
    intro:
      'Pointer and keyboard orchestration for a canvas element you render yourself. `GridCanvas` uses this hook internally.',
    files: ['react/interaction.ts', 'interaction/attributes.ts', 'interaction/gesture.ts'],
  },
  {
    id: 'react/transfer',
    title: 'Transfer scope',
    entry: 'react',
    intro:
      'Move items between providers. Wrap several `GridProvider`s in a `GridTransferScope`; the pointer decides the target and the provider callbacks report the transfer.',
    files: ['react/transfer.tsx', 'react/transfer-context.ts'],
  },
  {
    id: 'react/types',
    title: 'Types',
    entry: 'react',
    intro: 'State, action, and event types shared by the provider, hooks, and components.',
    files: ['react/types.ts', 'interaction/types.ts'],
  },
  {
    id: 'solid/provider',
    title: 'Provider',
    entry: 'solid',
    intro:
      '`GridProvider` owns layout and gesture state for one canvas. It accepts every `SolveOptions` field as a prop, works controlled or uncontrolled, reads its props reactively, and exposes the controller through context.',
    files: ['solid/provider.ts', 'solid/context.ts'],
  },
  {
    id: 'solid/components',
    title: 'Components',
    entry: 'solid',
    intro:
      'Headless building blocks written without a compiler. `GridCanvas` measures itself on mount and binds input; `GridItem` positions one item and exposes drag and resize handles; `GridPreviewOutline` shows where the active item will land; `createElement` is the hyperscript-or-SSR helper they are built with.',
    files: ['solid/components.ts', 'solid/element.ts', 'interaction/attributes.ts'],
  },
  {
    id: 'solid/primitives',
    title: 'Primitives',
    entry: 'solid',
    intro:
      'Accessors over slices of provider state built with `from()` over the controller store, plus the imperative actions. Each accessor notifies only when its slice changes.',
    files: ['solid/hooks.ts'],
  },
  {
    id: 'solid/transfer',
    title: 'Transfer scope',
    entry: 'solid',
    intro:
      'Move items between providers. Wrap several `GridProvider`s in a `GridTransferScope`; the pointer decides the target and the provider callbacks report the transfer.',
    files: ['solid/transfer.ts'],
  },
  {
    id: 'solid/types',
    title: 'Types',
    entry: 'solid',
    intro: 'State, action, and event types shared by the provider, primitives, and components.',
    files: ['interaction/types.ts'],
  },
  {
    id: 'angular/provider',
    title: 'Provider',
    entry: 'angular',
    intro:
      '`GridProviderComponent` (`<gridla-provider>` or `[gridlaProvider]`) owns layout and gesture state for one canvas and provides an injectable `GridController` to its content. `provideGridla` registers application-wide defaults.',
    files: ['angular/provider.component.ts', 'angular/controller.ts', 'angular/provide.ts'],
  },
  {
    id: 'angular/components',
    title: 'Components',
    entry: 'angular',
    intro:
      'Headless building blocks. `<gridla-canvas>` measures itself and wires input; `[gridlaItem]` positions one item and renders built-in resize handles; `<gridla-preview-outline>` shows where the active item will land; `<gridla-transfer-scope>` lets items move between providers.',
    files: [
      'angular/canvas.component.ts',
      'angular/item.directive.ts',
      'angular/preview-outline.component.ts',
      'angular/transfer-scope.component.ts',
      'interaction/attributes.ts',
    ],
  },
  {
    id: 'angular/signals',
    title: 'Signals',
    entry: 'angular',
    intro:
      'Read provider state as signals from any injection context: a slice of the state, one item as it should be painted, or the imperative actions.',
    files: ['angular/inject.ts', 'angular/view.ts'],
  },
  {
    id: 'angular/types',
    title: 'Types',
    entry: 'angular',
    intro:
      'Output payloads, application options, and the state, action, and change types shared with the other adapters.',
    files: ['angular/types.ts', 'interaction/types.ts'],
  },
  {
    id: 'svelte/components',
    title: 'Components',
    entry: 'svelte',
    intro:
      'Svelte 5 components over the interaction layer. `GridProvider` owns layout and gesture state for one canvas (`bind:layout` or `defaultLayout`); `GridCanvas` measures itself and wires input; `GridItem` positions one item and passes its view to the children snippet; `GridPreviewOutline` shows where the active item will land; `GridTransferScope` lets items move between providers.',
    files: [
      'svelte/GridProvider.svelte',
      'svelte/GridCanvas.svelte',
      'svelte/GridItem.svelte',
      'svelte/GridPreviewOutline.svelte',
      'svelte/GridTransferScope.svelte',
    ],
  },
  {
    id: 'svelte/runes',
    title: 'Runes',
    entry: 'svelte',
    intro:
      'Rune-style readers over the nearest provider, called during component initialization: `gridStore` selects a slice of state, `gridItemView` follows one item, `gridLayout` and `gridSelection` read the rendered layout and the selection, and `gridActions` reaches the imperative API. `createGridRunes` wraps a controller store in `$state.raw` for custom providers.',
    files: ['svelte/context.svelte.ts', 'svelte/view.ts'],
  },
  {
    id: 'svelte/types',
    title: 'Types',
    entry: 'svelte',
    intro:
      'Component props, the item view passed to snippets, and the state, action, and change types shared with the other adapters.',
    files: ['svelte/types.ts', 'interaction/types.ts', 'interaction/attributes.ts'],
  },
  {
    id: 'vue/provider',
    title: 'Provider',
    entry: 'vue',
    intro:
      '`GridProvider` owns layout and gesture state for one canvas. It takes every `SolveOptions` field as a prop, works controlled (`v-model:layout`) or uncontrolled (`default-layout`), and provides the store, actions, and controller to its descendants.',
    files: ['vue/provider.ts', 'vue/context.ts'],
  },
  {
    id: 'vue/components',
    title: 'Components',
    entry: 'vue',
    intro:
      'Headless building blocks. `GridCanvas` measures itself and wires input; `GridItem` positions one item and exposes drag and resize handle attributes through its default slot; `GridPreviewOutline` shows where the active item will land.',
    files: ['vue/components.ts', 'interaction/attributes.ts'],
  },
  {
    id: 'vue/composables',
    title: 'Composables',
    entry: 'vue',
    intro:
      'Subscribe to slices of provider state as shallow refs, read the rendered or visible layout, and reach the imperative actions.',
    files: ['vue/composables.ts'],
  },
  {
    id: 'vue/transfer',
    title: 'Transfer scope',
    entry: 'vue',
    intro:
      'Move items between providers. Wrap several `GridProvider`s in a `GridTransferScope`; the pointer decides the target and the provider events report the transfer.',
    files: ['vue/transfer.ts'],
  },
  {
    id: 'vue/types',
    title: 'Types',
    entry: 'vue',
    intro: 'State, action, and event types shared by the provider, composables, and components.',
    files: ['vue/types.ts', 'interaction/types.ts'],
  },
  {
    id: 'qwik/provider',
    title: 'Provider',
    entry: 'qwik',
    intro:
      '`GridProvider` owns layout and gesture state for one canvas. The server renders the layout from props; on the client a controller is created in a visible task and mirrored into a signal. Callbacks carry the Qwik `$` suffix.',
    files: ['qwik/provider.tsx', 'qwik/context.ts'],
  },
  {
    id: 'qwik/components',
    title: 'Components',
    entry: 'qwik',
    intro:
      'Headless building blocks. `GridCanvas` measures itself and binds input with native listeners; `GridItem` positions one item and projects its children through a `Slot`; `GridPreviewOutline` shows where the active item will land.',
    files: ['qwik/components.tsx', 'interaction/attributes.ts'],
  },
  {
    id: 'qwik/hooks',
    title: 'Hooks',
    entry: 'qwik',
    intro:
      "Read provider state as signals, derive one item's view, and reach the client-only runtime that holds the controller.",
    files: ['qwik/hooks.ts', 'qwik/view.ts'],
  },
  {
    id: 'qwik/transfer',
    title: 'Transfer scope',
    entry: 'qwik',
    intro:
      'Move items between providers. Wrap several `GridProvider`s in a `GridTransferScope`; the pointer decides the target and the provider callbacks report the transfer.',
    files: ['qwik/transfer.tsx'],
  },
  {
    id: 'qwik/types',
    title: 'Types',
    entry: 'qwik',
    intro: 'State and change types re-exported from the interaction layer for Qwik consumers.',
    files: ['interaction/types.ts'],
  },
]

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

const entryFiles = {
  core: path.join(SRC_DIR, 'core/index.ts'),
  interaction: path.join(SRC_DIR, 'interaction/index.ts'),
  dom: path.join(SRC_DIR, 'dom/index.ts'),
  elements: path.join(SRC_DIR, 'elements/index.ts'),
  react: path.join(SRC_DIR, 'react/index.ts'),
  vue: path.join(SRC_DIR, 'vue/index.ts'),
  solid: path.join(SRC_DIR, 'solid/index.ts'),
  angular: path.join(SRC_DIR, 'angular/index.ts'),
  qwik: path.join(SRC_DIR, 'qwik/index.ts'),
  // `.svelte` components have no TypeScript source to read; the entry is the
  // declaration output of `scripts/build-svelte.ts` (run `bun run build` first).
  svelte: path.join(REPO_DIR, 'packages/gridla/dist/svelte/index.d.ts'),
}
type EntryName = keyof typeof entryFiles
const ENTRY_ORDER: EntryName[] = [
  'core',
  'interaction',
  'react',
  'dom',
  'elements',
  'vue',
  'solid',
  'angular',
  'svelte',
  'qwik',
]
const IMPORT_PATH: Record<EntryName, string> = {
  core: 'gridla',
  interaction: 'gridla/interaction',
  dom: 'gridla/dom',
  elements: 'gridla/elements',
  react: 'gridla/react',
  vue: 'gridla/vue',
  solid: 'gridla/solid',
  angular: 'gridla/angular',
  svelte: 'gridla/svelte',
  qwik: 'gridla/qwik',
}

const program = ts.createProgram(Object.values(entryFiles), {
  // The Angular entry imports the package's own entry points by name.
  paths: {
    gridla: [path.join(SRC_DIR, 'index.ts')],
    'gridla/interaction': [path.join(SRC_DIR, 'interaction.ts')],
  },
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  types: [],
})
const checker = program.getTypeChecker()

const FORMAT =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope |
  ts.TypeFormatFlags.WriteArrayAsGenericType

function docOf(symbol: ts.Symbol): string {
  return ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim()
}

function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const match = flat.match(/^(.+?[.!?])(\s|$)/)
  return (match ? match[1] : flat).trim()
}

function relativeSourceFile(node: ts.Node): string {
  const relative = path.relative(SRC_DIR, node.getSourceFile().fileName).replace(/\\/g, '/')
  // Declarations read from `dist/svelte/` map back to their sources.
  const built = /^\.\.\/dist\/(svelte\/.+)\.d\.ts$/.exec(relative)
  if (!built) return relative
  // `X.svelte.d.ts` is emitted for both `X.svelte` and a `X.svelte.ts` rune module.
  return fs.existsSync(path.join(SRC_DIR, `${built[1]}.ts`)) ? `${built[1]}.ts` : built[1]
}

/** Whether a declaration was read from built output rather than a source file. */
function isBuilt(node: ts.Node): boolean {
  return node.getSourceFile().fileName.includes('/dist/')
}

/** Source line of a declaration, or `0` for built output (no matching source line). */
function lineOf(node: ts.Node): number {
  if (isBuilt(node)) return 0
  return node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1
}

/** Source text of a declaration without its JSDoc and without a function body. */
function signatureText(decl: ts.Declaration): string {
  const source = decl.getSourceFile()
  if (ts.isFunctionDeclaration(decl)) {
    const end = decl.body ? decl.body.getStart(source) : decl.getEnd()
    return source.text
      .slice(decl.getStart(source), end)
      .trim()
      .replace(/\s*\{$/, '')
  }
  if (ts.isVariableDeclaration(decl)) {
    const statement = decl.parent.parent
    const nameSymbol = checker.getSymbolAtLocation(decl.name)
    const type = nameSymbol
      ? checker.getTypeOfSymbolAtLocation(nameSymbol, decl)
      : checker.getTypeAtLocation(decl)
    const modifiers = ts.isVariableStatement(statement) ? 'export const ' : 'const '
    return `${modifiers}${decl.name.getText(source)}: ${checker.typeToString(type, decl, FORMAT)}`
  }
  return decl.getText(source).trim()
}

function componentSignature(decl: ts.Declaration, name: string): string {
  // Function components read best as their source header; `forwardRef`
  // components as their declared type, which names the props type.
  if (ts.isFunctionDeclaration(decl)) return signatureText(decl)
  const nameNode = (decl as ts.NamedDeclaration).name
  const symbol = nameNode ? checker.getSymbolAtLocation(nameNode) : undefined
  if (!symbol) return signatureText(decl)
  const type = checker.getTypeOfSymbolAtLocation(symbol, decl)
  return `export const ${name}: ${checker.typeToString(type, decl, FORMAT)}`
}

function isReactComponent(name: string, decl: ts.Declaration): boolean {
  if (!/^[A-Z]/.test(name)) return false
  if (relativeSourceFile(decl).endsWith('.svelte')) return true
  if (ts.isFunctionDeclaration(decl)) return /^(react|solid)\//.test(relativeSourceFile(decl))
  if (ts.isVariableDeclaration(decl) && decl.initializer) {
    return decl.initializer.getText().startsWith('forwardRef')
  }
  return false
}

/** `export class Name<T> implements X` plus its decorator's selector, without the body. */
function classSignature(decl: ts.ClassDeclaration): string {
  const source = decl.getSourceFile()
  const text = source.text.slice(decl.getStart(source), decl.members.pos)
  const header = (/(?:export\s+)?(?:abstract\s+)?class\b[\s\S]*$/.exec(text)?.[0] ?? text)
    .replace(/\s*\{\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  const selector = /selector:\s*'([^']+)'/.exec(text)?.[1]
  return selector ? `${header} // selector: ${selector}` : header
}

function classMembers(decl: ts.ClassDeclaration): Member[] {
  const members: Member[] = []
  for (const member of decl.members) {
    if (!ts.isPropertyDeclaration(member) && !ts.isMethodDeclaration(member)) continue
    if (!member.name || !ts.isIdentifier(member.name)) continue
    const modifiers = ts.getCombinedModifierFlags(member)
    if (modifiers & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) continue
    const symbol = checker.getSymbolAtLocation(member.name)
    if (!symbol) continue
    const type = checker.typeToString(
      checker.getTypeOfSymbolAtLocation(symbol, member),
      member,
      FORMAT,
    )
    members.push({ name: member.name.text, type, doc: docOf(symbol), optional: false })
  }
  return members
}

function membersOf(decl: ts.Declaration): Member[] {
  if (ts.isClassDeclaration(decl)) return classMembers(decl)
  if (!ts.isTypeAliasDeclaration(decl) && !ts.isInterfaceDeclaration(decl)) return []
  const type = checker.getTypeAtLocation(decl)
  if (type.isUnion() && type.types.every((member) => member.isStringLiteral())) return []
  const properties = type.getProperties()
  if (properties.length === 0) return []
  // Skip huge intersections with HTML attributes (component props): list only
  // the members declared in this file.
  const own = properties.filter((prop) =>
    (prop.declarations ?? []).some((d) => d.getSourceFile() === decl.getSourceFile()),
  )
  const list = own.length > 0 && own.length < properties.length ? own : properties
  if (list.length > 40) return []
  return list.map((prop) => {
    const propDecl = prop.valueDeclaration ?? prop.declarations?.[0]
    const propType = propDecl
      ? checker.typeToString(checker.getTypeOfSymbolAtLocation(prop, propDecl), propDecl, FORMAT)
      : 'unknown'
    return {
      name: prop.getName(),
      type: propType.replace(/ \| undefined$/, ''),
      doc: docOf(prop),
      optional: (prop.flags & ts.SymbolFlags.Optional) !== 0,
    }
  })
}

function collect(entry: EntryName): Entry[] {
  const file = program.getSourceFile(entryFiles[entry])
  if (!file) throw new Error(`missing entry ${entryFiles[entry]}`)
  const moduleSymbol = checker.getSymbolAtLocation(file)
  if (!moduleSymbol) throw new Error(`no module symbol for ${entry}`)
  const entries: Entry[] = []
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const symbol =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
    const decl = symbol.valueDeclaration ?? symbol.declarations?.[0]
    if (!decl) continue
    const name = exported.getName()
    const doc = docOf(symbol)
    let kind: Kind
    let signature: string
    if (ts.isTypeAliasDeclaration(decl) || ts.isInterfaceDeclaration(decl)) {
      kind = 'type'
      signature = signatureText(decl)
    } else if (isReactComponent(name, decl)) {
      kind = 'component'
      signature = componentSignature(decl, name)
    } else if (ts.isFunctionDeclaration(decl)) {
      kind = name.startsWith('use') ? 'hook' : 'function'
      signature = signatureText(decl)
    } else if (ts.isVariableDeclaration(decl)) {
      const type = checker.getTypeOfSymbolAtLocation(symbol, decl)
      kind = type.getCallSignatures().length > 0 ? 'function' : 'const'
      signature = signatureText(decl)
    } else if (ts.isClassDeclaration(decl)) {
      // Angular components and directives are classes; the members table
      // lists their public API (inputs, outputs, signals, methods).
      kind = /(Component|Directive)$/.test(name) ? 'component' : 'class'
      signature = classSignature(decl)
    } else {
      kind = 'const'
      signature = signatureText(decl)
    }
    entries.push({
      name,
      kind,
      summary: firstSentence(doc),
      doc,
      signature,
      members: membersOf(decl),
      file: relativeSourceFile(decl),
      line: lineOf(decl),
      documented: doc.length > 0,
    })
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

// ---------------------------------------------------------------------------
// MDX
// ---------------------------------------------------------------------------

const KIND_ORDER: Kind[] = ['function', 'component', 'class', 'hook', 'const', 'type']
const KIND_LABEL: Record<Kind, string> = {
  function: 'Functions',
  component: 'Components',
  class: 'Classes',
  hook: 'Hooks',
  const: 'Constants',
  type: 'Types',
}

/** Escape text for a GFM table cell inside MDX. */
function cell(text: string): string {
  return text
    .replace(/\|/g, '\\|')
    .replace(/\n+/g, ' ')
    .replace(/[{}<>]/g, (c) => `\\${c}`)
}

function inlineCode(text: string): string {
  return `\`${text.replace(/\|/g, '\\|')}\``
}

/** Turn `` `X` `` references in prose into links when X is a known export. */
function linkify(text: string, index: Map<string, string>, currentGroup: string): string {
  return text.replace(/`([A-Za-z_][A-Za-z0-9_]*)`/g, (match, name: string) => {
    const group = index.get(name)
    if (!group) return match
    const target =
      group === currentGroup ? `#${name.toLowerCase()}` : `/api/${group}#${name.toLowerCase()}`
    return `[${match}](${target})`
  })
}

function escapeProse(text: string): string {
  return text.replace(/[{}<>]/g, (c) => `\\${c}`)
}

function renderEntry(entry: Entry, index: Map<string, string>, group: Group): string {
  const lines: string[] = []
  lines.push(`### ${entry.name}`)
  lines.push('')
  lines.push(
    `<span className="g-api-meta">${entry.kind} · <a href="https://github.com/wintercounter/gridla/blob/main/packages/gridla/src/${entry.file}${entry.line > 0 ? `#L${entry.line}` : ''}">${entry.file}${entry.line > 0 ? `:${entry.line}` : ''}</a></span>`,
  )
  lines.push('')
  if (entry.doc) {
    lines.push(linkify(escapeProse(entry.doc), index, group.id))
    lines.push('')
  }
  lines.push('```ts')
  lines.push(entry.signature)
  lines.push('```')
  lines.push('')
  if (entry.members.length > 0) {
    lines.push('| Member | Type | Description |')
    lines.push('| --- | --- | --- |')
    for (const member of entry.members) {
      const name = inlineCode(member.optional ? `${member.name}?` : member.name)
      lines.push(`| ${name} | ${inlineCode(cell(member.type))} | ${cell(member.doc)} |`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function renderGroup(group: Group, entries: Entry[], index: Map<string, string>): string {
  const importPath = IMPORT_PATH[group.entry]
  const lines: string[] = []
  lines.push('---')
  lines.push(`title: ${group.title}`)
  lines.push(
    `description: ${group.title} exports of ${importPath}. Generated from the source declarations.`,
  )
  lines.push('---')
  lines.push('')
  lines.push(`# ${group.title}`)
  lines.push('')
  lines.push(
    `> Generated by \`website/scripts/generate-api.ts\` from \`packages/gridla/src\`. Do not edit by hand; run \`bun run generate\` in \`website/\`.`,
  )
  lines.push('')
  lines.push(linkify(group.intro, index, group.id))
  lines.push('')
  lines.push('```ts')
  lines.push(
    `import { ${entries
      .filter((e) => e.kind !== 'type')
      .map((e) => e.name)
      .join(', ')} } from '${importPath}'`,
  )
  const types = entries.filter((e) => e.kind === 'type').map((e) => e.name)
  if (types.length > 0) lines.push(`import type { ${types.join(', ')} } from '${importPath}'`)
  lines.push('```')
  lines.push('')
  lines.push('| Export | Kind | Summary |')
  lines.push('| --- | --- | --- |')
  for (const entry of entries) {
    lines.push(
      `| [${inlineCode(entry.name)}](#${entry.name.toLowerCase()}) | ${entry.kind} | ${cell(entry.summary)} |`,
    )
  }
  lines.push('')
  for (const kind of KIND_ORDER) {
    const of = entries.filter((entry) => entry.kind === kind)
    if (of.length === 0) continue
    lines.push(`## ${KIND_LABEL[kind]}`)
    lines.push('')
    for (const entry of of) {
      lines.push(renderEntry(entry, index, group))
    }
  }
  return `${lines.join('\n').trimEnd()}\n`
}

function renderIndex(groups: { group: Group; entries: Entry[] }[]): string {
  const lines: string[] = []
  lines.push('---')
  lines.push('title: API reference')
  lines.push(
    'description: Every public export of gridla, gridla/interaction, and gridla/react, grouped by module and generated from the source declarations.',
  )
  lines.push('---')
  lines.push('')
  lines.push('# API reference')
  lines.push('')
  lines.push(
    'Gridla publishes one package with three entry points. `gridla` is the framework-neutral core: pure functions over plain objects. `gridla/interaction` is the framework-neutral interaction layer: a controller, pointer gesture, transfer scope, and measurement on top of the core. `gridla/react` is the adapter: a provider, headless components, and hooks as thin bindings over the interaction layer.',
  )
  lines.push('')
  lines.push(
    '> These pages are generated from the JSDoc on the exported declarations by `website/scripts/generate-api.ts`. If something here is unclear, the fix belongs in the source comment.',
  )
  lines.push('')
  for (const entry of ENTRY_ORDER) {
    lines.push(`## \`${IMPORT_PATH[entry]}\``)
    lines.push('')
    lines.push('| Module | Exports | What it covers |')
    lines.push('| --- | --- | --- |')
    for (const { group, entries } of groups.filter((g) => g.group.entry === entry)) {
      const names = entries
        .slice(0, 6)
        .map((e) => inlineCode(e.name))
        .join(', ')
      const more = entries.length > 6 ? `, +${entries.length - 6} more` : ''
      lines.push(
        `| [${group.title}](/api/${group.id}) | ${names}${more} | ${cell(firstSentence(group.intro))} |`,
      )
    }
    lines.push('')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const all = {
  core: collect('core'),
  interaction: collect('interaction'),
  dom: collect('dom'),
  elements: collect('elements'),
  react: collect('react'),
  vue: collect('vue'),
  solid: collect('solid'),
  angular: collect('angular'),
  svelte: collect('svelte'),
  qwik: collect('qwik'),
}
const index = new Map<string, string>()
const assigned = new Set<string>()
const output: { group: Group; entries: Entry[] }[] = []

for (const group of GROUPS) {
  const entries = all[group.entry].filter((entry) => group.files.includes(entry.file))
  for (const entry of entries) {
    index.set(entry.name, group.id)
    assigned.add(`${group.entry}:${entry.name}`)
  }
  output.push({ group, entries })
}

const unassigned = ENTRY_ORDER.flatMap((entry) =>
  all[entry].map((e) => `${entry}:${e.name} (${e.file})`),
).filter((key) => !assigned.has(key.split(' ')[0]))
if (unassigned.length > 0) {
  console.error('generate-api: exports without a group:\n  ' + unassigned.join('\n  '))
  process.exit(1)
}

for (const { group, entries } of output) {
  const file = path.join(OUT_DIR, `${group.id}.mdx`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, renderGroup(group, entries, index))
}
fs.writeFileSync(path.join(OUT_DIR, 'index.mdx'), renderIndex(output))

const undocumented = ENTRY_ORDER.flatMap((entry) => all[entry]).filter((entry) => !entry.documented)
process.stdout.write(
  `generate-api: wrote ${output.length + 1} pages for ${all.core.length} core, ${all.interaction.length} interaction, and ${all.react.length} react exports\n`,
)
if (undocumented.length > 0) {
  process.stdout.write(`generate-api: ${undocumented.length} exports have no JSDoc:\n`)
  for (const entry of undocumented)
    process.stdout.write(`  ${entry.file}:${entry.line} ${entry.name}\n`)
}
