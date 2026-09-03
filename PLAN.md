# Gridla Extraction Plan

## Goal

Create a standalone, open-source pixel-based grid and nested-layout library
with:

- a framework-neutral JavaScript core;
- first-class TypeScript declarations;
- an optional React adapter;
- no drag-and-drop framework, DOM event lifecycle, renderer, application store,
  or consumer data model in the core package.

The project should preserve the proven behavior of the existing engine while
creating a small, stable public API that can be used from React, other UI
frameworks, a browser without a framework, or a server-side process.

Delivery includes the complete public project, not only source extraction:

- production-ready packages published to npm;
- an attractive, comprehensive README;
- a polished documentation and playground site deployed to GitHub Pages;
- a broad gallery of customizable vanilla and React demos;
- exhaustive unit, compatibility, browser, accessibility, visual, and package
  tests;
- a complex React studio demonstrating a page-builder-quality experience
  without a JSON-driven UI framework;
- automated releases, provenance, changelogs, and public contribution docs.

## Existing Engine Baseline

The framework-neutral frame, geometry, projection, and solver code is already
largely composed of deterministic functions. The main extraction difficulty is
separating generic nested-layout behavior from consumer data, rendering,
interaction state, and persistence conventions.

The focused layout test baseline is:

```text
6 test files passed
413 tests passed
3 tests skipped
```

## Architectural Boundary

### Core package

The core owns layout data and deterministic transformations:

- canvas and item models;
- normalization and bounds clamping;
- geometry and collision checks;
- responsive frame projection;
- fixed and flexible sizing;
- minimum and maximum size constraints;
- gap preservation;
- move, resize, insert, and transfer solving;
- sibling push, swap, reorder, shrink, and snap policies;
- nested group coordinate projection;
- hit testing using numeric rectangles;
- compact-to-fit behavior;
- row, column, and grid layout presets.

The core receives plain objects and returns plain objects. It must not read or
write application state or browser state.

### React adapter

The React package translates UI interactions into core operations and renders
their results. It may own:

- a small `GridProvider` and focused context hooks;
- hooks;
- pointer-event orchestration;
- DOM measurement and `ResizeObserver`;
- active interaction and preview state;
- pointer capture and selection suppression;
- drag handles and resize handles;
- optional cross-container drag-and-drop coordination;
- optional headless components or render props.

The adapter must not depend on Zustand, Redux, a DnD package, a styling
library, or another state-management/runtime package. React is a peer
dependency, not a bundled runtime dependency.

For efficient updates, `GridProvider` should place a stable, tiny store object
in context rather than the full changing state value. The store can be
implemented locally with `getSnapshot`, `subscribe`, and `dispatch`; selector
hooks can consume it through React's built-in `useSyncExternalStore`. This
keeps subscriptions granular without introducing a state-library dependency.
The provider should also support controlled state and callbacks for consumers
that already own interaction state.

Drag-and-drop is therefore not an engine dependency. The adapter calls core
operations such as `moveItem`, `resizeItem`, and `placeItem` in response to
pointer or DnD events.

### Consumer boundary

Any consumer remains responsible for translating its own data model into
Gridla's public model and for owning product-specific persistence, rendering,
styling, localization, and interaction policy.

## Proposed Repository and Packages

Start with one repository containing two packages:

```text
gridla/
  .github/
    workflows/
  packages/
    core/
      src/
        model.ts
        geometry.ts
        projection.ts
        solver/
        nested-layout/
        presets.ts
        instrumentation.ts
        index.ts
    react/
      src/
        grid-provider.tsx
        state.ts
        use-grid.ts
        use-grid-state.ts
        use-grid-interaction.ts
        use-grid-measurement.ts
        index.ts
  examples/
    vanilla-basics/
    react-basics/
    gallery/
    studio/
  website/
    docs/
    theme/
    components/
    public/
  tests/
    compatibility/
    e2e/
    fixtures/
    package/
  benchmarks/
  scripts/
  package.json
  README.md
  CONTRIBUTING.md
  CODE_OF_CONDUCT.md
  SECURITY.md
  CHANGELOG.md
  LICENSE
```

Suggested published entry points:

```text
gridla
gridla/react
```

Separate physical packages can be introduced later if independent versioning
or installation becomes useful. Initially, subpath exports reduce release and
documentation overhead while still preventing React from entering the core
dependency graph. Both entry points should have zero third-party runtime
dependencies; the React entry point declares only React as a peer dependency.

## Modern Toolchain

Prefer fast Rust- and Go-based tooling where it is mature and correct. Do not
add a legacy JavaScript tool by habit when the selected native tool covers the
required behavior.

| Concern                      | Selected direction                                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Library builds               | [Rslib](https://rslib.rs/) for core and React outputs, declarations, source maps, and export formats                                      |
| Demo applications            | [Rsbuild](https://rsbuild.rs/) powered by Rspack                                                                                          |
| Documentation site           | [Rspress](https://rspress.dev/) with MDX and static GitHub Pages output                                                                   |
| Linting                      | [Oxlint](https://oxc.rs/docs/guide/usage/linter/quickstart) with native TypeScript, React, accessibility, import, and correctness rules   |
| Formatting                   | [Oxfmt](https://oxc.rs/docs/guide/usage/formatter) for TypeScript, TSX, JSON, CSS, Markdown, and MDX                                      |
| Type-aware checks            | Oxlint plus its Go-powered `tsgolint` integration when compatible with the selected TypeScript version                                    |
| Unit and compatibility tests | A fast TypeScript test runner selected for faithful porting and deterministic snapshots; benchmark alternatives before locking it         |
| Browser tests                | [Playwright](https://playwright.dev/) with standard browser projects and an [Obscura](https://github.com/h4ckf0r0day/obscura) CDP project |
| CI and hosting               | GitHub Actions and GitHub Pages                                                                                                           |
| npm publishing               | npm trusted publishing through GitHub Actions OIDC with provenance                                                                        |

Tool selection rules:

- Pin tool versions and native binaries through the lockfile.
- Keep package runtime dependencies at zero; build and test tools are dev-only.
- Do not use Webpack, ESLint, or Prettier in parallel with the selected Rstack
  and Oxc tools unless a documented compatibility gap requires a temporary
  fallback.
- Treat experimental native type-checking as a gated choice: correctness and
  declaration fidelity must be demonstrated before it replaces a stable check.
- Measure cold build, warm rebuild, test, lint, and format time and record the
  selected stack in an architecture decision record.
- Verify current stable versions and platform support at implementation time;
  never copy version numbers from this planning document.

## Core API Direction

Use framework-neutral names rather than exposing current interaction-oriented
implementation names:

| Current name                | Public direction |
| --------------------------- | ---------------- |
| `FrameCanvas` / `Canvas`    | `GridCanvas`     |
| `FrameItem` / `CanvasItem`  | `GridItem`       |
| `FrameLayout`               | `GridLayout`     |
| `solveCanvasDrag`           | `moveItem`       |
| `solveCanvasResize`         | `resizeItem`     |
| `solveCanvasExternalDrop`   | `placeItem`      |
| `solveCanvasCrossGroupDrop` | `transferItem`   |
| `projectFrameLayout`        | `projectLayout`  |
| `buildFlatLayout`           | `flattenLayout`  |

A tentative functional API:

```ts
type SolveResult = {
  accepted: boolean
  activeItem: GridItem
  items: GridItem[]
  effects?: {
    shiftedSiblingIds?: string[]
  }
}

moveItem({ layout, itemId, position, options }): SolveResult
resizeItem({ layout, itemId, rect, edge, options }): SolveResult
placeItem({ layout, item, position, options }): SolveResult
transferItem({ source, target, itemId, position, options }): TransferResult
projectLayout(layout, targetCanvas): GridLayout
flattenLayout(tree, viewport, adapter?): FlatLayout
```

Exact names should be finalized only after the current behavior has been
captured as compatibility tests.

## Public Model Cleanup

### Keep in core

- item identifier and rectangle;
- minimum and maximum dimensions;
- fixed/flexible axis behavior;
- canvas bounds, padding, and bounded/scrollable height;
- solver participation policies;
- optional caller-owned metadata through a generic type parameter.

### Move out of core

- `ReactNode` menu labels;
- React `CSSProperties` types;
- `isDraggable`, `isResizable`, and `resizeHandles` rendering policy;
- `HTMLElement`, `DOMRect`, and browser events;
- registry nodes and widget component definitions;
- application persistence and mutation callbacks.

### Rename or generalize

The current `static` and `immovable` fields are meaningful solver policies but
are too implementation-specific for a public API. Prefer an explicit model,
for example:

```ts
type GridItemPolicy = {
  collision?: 'solid' | 'ignore'
  movement?: 'movable' | 'locked'
}
```

Detached widgets should initially remain a consumer concern. Consumers can
express their canonical slots through the generic collision policy. A public
floating or detached-item abstraction should be added only when demonstrated
as a generally useful requirement.

## Nested Layout Decoupling

The current flat-layout implementation combines generic projection math with
consumer tree traversal. Split it into:

1. Generic nested-layout operations accepting a normalized tree.
2. A generic adapter interface consumers can implement for their own trees.

Possible normalized input:

```ts
type GridNode<T = unknown> = {
  id: string
  frame?: GridLayout
  children?: GridNode<T>[]
  behavior?: {
    container?: boolean
    acceptsChildren?: boolean
    contained?: boolean
    locked?: boolean
  }
  data?: T
}
```

Alternatively, expose traversal callbacks so consumers do not need to clone
their own tree into a library-defined model:

```ts
type GridTreeAdapter<T> = {
  getId(node: T): string
  getChildren(node: T): readonly T[]
  getFrame(node: T): GridLayout | null
  getBehavior(node: T): GridNodeBehavior
}
```

Prototype both forms before freezing the API. Prefer the normalized model if it
makes the solver and documentation materially simpler; prefer callbacks if
conversion creates excessive allocation or synchronization complexity.

## Public Experience and Visual Direction

The repository, README, documentation, and demos are part of the product. They
must feel intentionally designed rather than like generated API scaffolding.

Establish a small visual system before building pages:

- distinctive Gridla wordmark and visual identity;
- restrained color system with excellent light and dark themes;
- typography optimized for prose, API reference, and dense coordinate data;
- spacing, radius, border, elevation, motion, and code-block tokens;
- reusable demo frame, control panel, inspector, callout, and comparison
  components;
- responsive behavior driven by intrinsic sizing and container queries;
- visible keyboard focus, reduced-motion support, sufficient contrast, and
  logical properties where appropriate;
- no runtime UI framework or CSS-in-JS dependency.

Use native platform features and lightweight CSS. Avoid visual effects that
make dragging, resizing, code reading, or mobile use less clear. Use containment
carefully around independent demo regions, with intrinsic-size fallbacks, to
limit layout work during interactions.

### Image-generation note for the implementation agent

Claude may use Codex's image-generation capability for original hero artwork,
social preview images, textures, or illustrative backgrounds. Generated assets
must follow an explicit art brief, be reviewed at desktop and mobile sizes, be
optimized before commit, and include retained prompts/provenance where useful.
Keep the wordmark, diagrams, icons, and technical illustrations as editable
SVG/CSS whenever precision, accessibility, or theming matters; do not bake
important text into generated raster images.

## README Delivery

The root README should work as a concise, beautiful landing page without
duplicating the full documentation. Include:

- a strong hero with a one-sentence value proposition;
- a lightweight animated or still preview showing nested responsive layout;
- npm, CI, coverage, bundle-size, license, and documentation badges;
- a copy-paste installation command;
- a minimal vanilla JavaScript example before any framework adapter;
- a minimal React Provider example;
- a feature overview grounded in actual behavior;
- clear core-versus-React architecture;
- links to live playgrounds, the studio example, API docs, and benchmarks;
- compatibility and browser-support statements;
- package-size and zero-runtime-dependency claims generated from CI evidence;
- contribution, security, governance, and license links;
- acknowledgements and asset provenance.

README acceptance is visual as well as textual: verify rendering on GitHub,
narrow mobile width, dark mode, and link/image integrity. Avoid oversized media
that makes the first useful content difficult to reach.

## Documentation and GitHub Pages Site

Build the site with Rspress and deploy its static output to GitHub Pages. The
site should include:

- custom home page and navigation rather than an untouched stock theme;
- Getting Started for vanilla JavaScript and React;
- mental model, coordinate systems, item constraints, sizing modes, gaps,
  projection, nesting, and solver behavior;
- core API and React API reference generated from the public declarations;
- operation recipes for move, resize, place, transfer, controlled state,
  persistence, keyboard controls, and custom rendering;
- interactive examples embedded in relevant guides;
- a dedicated playground with live controls and shareable URL state;
- architecture and data-flow diagrams;
- accessibility, performance, browser support, SSR, troubleshooting, and
  migration-between-Gridla-versions guides;
- changelog and versioned documentation strategy;
- contributor architecture notes and a guide for adding solver fixtures;
- searchable content, canonical metadata, sitemap, social cards, favicon, and
  useful `llms.txt` output;
- a prominent link to the final studio example.

GitHub Pages requirements:

- work correctly beneath the repository base path, not only at `/`;
- use relative/base-aware assets and links;
- publish only from a successful, immutable CI artifact;
- test the built static site before deployment;
- provide a custom 404 page and retain deep-link behavior where possible;
- meet agreed accessibility and performance budgets on desktop and mobile;
- validate every internal link and code sample in CI.

## Customizable Demo Gallery

Provide many focused demos rather than one overloaded sandbox. Every demo must
have sensible defaults, live controls, reset, inspectable layout data, and a
copyable code example. Where useful, support deterministic shareable URL state.

Initial gallery target:

1. Static vanilla layout and coordinate projection.
2. Responsive projection across container sizes.
3. Fixed, flexible, fixed-width, and fixed-height sizing.
4. Minimum and maximum constraints.
5. Padding and independently configurable gaps.
6. Bounded versus vertically scrollable canvases.
7. Programmatic move, resize, place, and rejection results.
8. Snap distance and alignment customization.
9. Push, swap, reorder, and shrink policy comparison.
10. Ignored-collision and locked-item policies.
11. Nested groups with coordinate inspection.
12. Cross-group transfer solving without DOM DnD.
13. React uncontrolled `GridProvider`.
14. React controlled state and persistence callbacks.
15. Custom item renderer and custom selection/resize chrome.
16. Pointer, touch, keyboard, and modifier-key interactions.
17. Multiple independent grids and shared-provider boundaries.
18. Server-render/import-safe React example.
19. High-item-count stress and performance visualization.
20. Layout import/export and preset gallery.

The gallery should make customization visible. Controls should cover canvas
size, padding, gap, snap threshold, sizing constraints, operation policies,
theme, direction, reduced motion, and representative item counts. A demo must
not require reading its source before its purpose is clear.

## Final React Studio Example

The capstone example is a polished React layout studio with an experience
comparable to a production page builder while staying focused on Gridla. It is
not part of the library runtime and must not force its application dependencies
onto consumers.

Include:

- component palette/sidebar with drag-to-add and click-to-add;
- responsive canvas with nested groups;
- direct selection, move, resize, multi-item selection where supported, and
  clear drop previews;
- property inspector for position, dimensions, constraints, sizing mode,
  padding, gap, locking, collision behavior, and appearance;
- rows, columns, and grid presets;
- layer/tree panel with selection synchronization;
- undo/redo and keyboard shortcuts;
- duplicate, delete, lock, hide, and reset actions;
- desktop/tablet/mobile preview sizes;
- layout-data import/export and local persistence;
- a small explicit React component registry for example content;
- templates demonstrating dashboard, editorial, analytics, and freeform
  compositions;
- keyboard-accessible editing paths and touch-friendly targets;
- performance instrumentation and an optional debug overlay;
- polished onboarding, empty state, contextual help, and error recovery.

Explicitly exclude authentication, backend storage, business data fetching,
JSON-rendered UI, a general application router, localization infrastructure,
and other concerns that do not demonstrate the library. JSON may serialize
layout data, but it must not define or render the application interface.

The studio is complete only when a new visitor can build, customize, save,
reload, export, and import a non-trivial nested layout without documentation.

## Browser Test Porting Contract

Audit every existing grid/page-builder browser test and maintain a port ledger
with one of three outcomes: `ported-core`, `ported-react-or-studio`, or
`not-applicable`, with a concrete reason. The known source inventory contains
113 tests across three suites; the count must be refreshed before porting.

Port all behavior applicable to the open-source packages or examples, including:

- initial layout integrity and no-scramble guarantees;
- pointer-down selection and parent/child targeting;
- move and resize handles, proximity, pointer capture, and cancellation;
- text-selection suppression during interaction;
- live active-item and sibling previews;
- free placement, edge alignment, snap bypass, and last-valid positioning;
- push, swap, cascade, reorder, elastic shrink, and retreat restoration;
- bounds, padding, gaps, fixed sizing, min/max preservation, and projection;
- nested-group child reflow during parent and neighboring-group changes;
- locked and ignored-collision behavior;
- cross-group placement and preview/commit equivalence;
- scrollable/full-height behavior and compact-to-fit;
- sidebar insertion behavior represented by the studio;
- keyboard move, resize, delete, undo, and redo;
- repeat interactions after commit;
- narrow, touch, and representative responsive viewport behavior.

Do not port tests for unrelated routing, authentication, product menus,
business widgets, JSON UI infrastructure, or application-specific page sharing.
Do not silently drop those tests: record why each is outside Gridla's scope.
Preserve useful regression comments and rewrite fixtures with neutral names.

### Playwright and Obscura execution

Use Playwright as the test API. Run two complementary lanes:

1. Standard Playwright projects for Chromium, Firefox, and WebKit. These are
   the authoritative rendering, pointer, accessibility, and cross-browser gate.
2. Obscura connected through Playwright over CDP. This is the Rust-powered fast
   lane and proves that the demos work through the requested integration.

Before bulk-porting, create an Obscura compatibility spike covering SPA
bootstrap, module scripts, pointer events, element boxes, screenshots,
keyboard input, `ResizeObserver`, animation frames, and required CDP methods.
Pin a verified Obscura release or binary digest. Keep the connection logic in a
custom Playwright fixture so test bodies remain shared.

Every portable test should run unchanged in the Obscura lane when its required
browser capabilities exist. Any temporary Obscura exclusion must name the
missing capability, link an upstream issue or local minimal reproduction, and
remain visible in CI; never convert compatibility gaps into silent skips.
Obscura results do not replace the standard multi-engine Playwright gate.

## Extraction Phases

### Phase 0: License and release decisions

- Choose the package and npm scope names.
- Choose an open-source license.
- Confirm that all extracted source can be published under that license.
- Define supported Node and browser versions.
- Decide ESM-only versus dual ESM/CommonJS output. Prefer ESM-only unless a
  confirmed consumer requires CommonJS.
- Establish semantic versioning and a changelog/release process.

Exit criteria:

- Repository metadata and publishing ownership are decided.
- No source extraction starts with unresolved licensing.

### Phase 1: Compatibility harness

- Copy representative pure-layout fixtures into a neutral compatibility suite.
- Include projection, fixed/flexible sizing, gaps, bounds, scrollable canvases,
  resize, move, push, swap, shrink, cross-group placement, nested groups,
  locked items, and ignored collision items.
- Capture deterministic input/output fixtures from the existing engine.
- Convert product-named fixtures to neutral names where their identity is not
  behaviorally relevant.
- Preserve regression comments that explain non-obvious behavior.

Exit criteria:

- Golden compatibility fixtures run entirely inside the open-source repository.
- Compatibility failures produce readable layout diffs.

### Phase 2: Extract the minimal core

- Extract model types from `packages/shared/src/registry/frame/types.ts`.
- Extract frame normalization and projection.
- Consolidate duplicated frame/canvas geometry helpers.
- Replace `DOMRect` with structural rectangle types.
- Keep all functions deterministic and free of module-global mutable state.
- Produce ESM JavaScript plus declaration files.
- Add package export and tree-shaking tests.

Exit criteria:

- Core has zero React, DOM, state-library, and consumer-model dependencies.
- Projection compatibility tests pass against the baseline.
- The vanilla example renders a projected layout without React.

### Phase 3: Extract the solver

- Move collision, clamping, snapping, push, swap, reorder, shrink, placement,
  and resize algorithms into core.
- Rename public operations around layout intent rather than UI events.
- Keep internal algorithms private unless there is a demonstrated extension
  need.
- Replace the existing debug logger with an optional instrumentation callback.
- Make thresholds such as snap distance explicit options with documented
  defaults.
- Audit mutation carefully: either guarantee immutable results or clearly
  document any mutable workspace internal to an operation.

Exit criteria:

- Existing solver and stability cases pass through the public core API.
- Core accepts no `Event`, element, ref, or store value.
- Repeated calls with equal inputs return structurally equal results.

### Phase 4: Extract generic nested layout

- Separate coordinate projection, group flattening, gap preservation, hit
  testing, and compact-to-fit from registry traversal.
- Introduce the normalized node model or tree adapter.
- Exclude consumer-specific container-type decisions from the library.
- Keep product persistence annotations outside the generic model.
- Benchmark deeply nested and high-item-count fixtures.

Exit criteria:

- Core can flatten an arbitrary nested grid without importing consumer types.
- Neutral nested-layout compatibility fixtures pass through the public adapter
  interface.
- Output ordering and hit-testing behavior remain compatible.

### Phase 5: Add the React adapter

- Implement a dependency-free `GridProvider` with a stable context value.
- Implement the internal state primitive with `getSnapshot`, `subscribe`, and
  `dispatch` rather than adopting a state-management package.
- Use `useSyncExternalStore` and selector hooks so unrelated items do not
  rerender for every pointer update.
- Implement measurement and resize observation.
- Implement pointer-driven move and resize hooks.
- Support both provider-owned state and controlled state/callbacks.
- Keep transient pointer coordinates in refs when they do not need to trigger
  rendering.
- Provide headless props and state before adding opinionated visual chrome.
- Keep HTML5/component DnD optional and outside the core dependency graph.
- Ensure server rendering does not access browser globals during import.

Exit criteria:

- The React entry point has no runtime dependencies and declares React only as
  a peer dependency.
- No Zustand, Redux, DnD, CSS-in-JS, or utility-library code enters the package.
- Importing `gridla` does not load React or DOM-specific code.
- Provider selectors demonstrate granular rerender behavior under rapid pointer
  updates.
- The React example supports move, resize, preview, and commit.
- The vanilla example remains fully functional.

### Phase 6: Build the visual system, README, and documentation shell

- Establish the visual direction and reusable design tokens.
- Produce the wordmark, diagrams, favicon, social card, and optimized media.
- Let Claude use Codex image generation for suitable original visual assets.
- Write and visually verify the root README.
- Scaffold and customize the Rspress site.
- Implement responsive navigation, search, themes, code presentation, and demo
  framing.
- Configure correct GitHub Pages base paths and metadata.

Exit criteria:

- README renders beautifully on GitHub and narrow screens.
- The custom docs shell passes keyboard, contrast, reduced-motion, responsive,
  and link checks.
- The production docs build works from its repository subpath.

### Phase 7: Build the documentation and demo gallery

- Write the conceptual, API, recipe, accessibility, performance, SSR, and
  troubleshooting documentation.
- Generate API reference from intentional public declarations.
- Implement the initial 20-demo gallery target.
- Give each interactive demo controls, reset, source, and inspectable data.
- Add the shareable playground and deterministic URL-state serialization.
- Add design and content review at phone, tablet, desktop, light, dark, and
  reduced-motion configurations.

Exit criteria:

- Every public API has reference documentation and at least one executable
  example.
- Every promised customization dimension appears in a focused demo.
- Examples and displayed code are compiled or exercised in CI.
- The gallery meets agreed performance, accessibility, and visual standards.

### Phase 8: Build the React studio example

- Implement the page-builder-quality studio described above using only the
  public core and React APIs.
- Use a small explicit component registry, not JSON-driven UI.
- Add palette insertion, nested editing, inspector controls, layer navigation,
  history, templates, persistence, import/export, and responsive previews.
- Add polished onboarding and recovery states.
- Profile interaction fan-out and eliminate avoidable rerenders and layout
  recalculation.

Exit criteria:

- A first-time visitor can complete the full build/save/reload/export/import
  journey without instructions.
- The studio does not import private package modules.
- Removing the studio does not change either published package artifact.
- Keyboard and touch workflows cover the primary editing operations.

### Phase 9: Port and expand end-to-end coverage

- Inventory the source browser suites and create the per-test port ledger.
- Port every applicable behavior into neutral core, React, gallery, or studio
  scenarios.
- Build the shared Playwright fixture for standard browsers and Obscura CDP.
- Complete the Obscura capability spike before assuming test compatibility.
- Add visual regression, accessibility, responsive, touch, and documentation
  navigation suites.
- Keep browser fixtures deterministic and independent of external services.

Exit criteria:

- Every inventoried source test has a reviewed disposition and rationale.
- Every applicable test is ported; there are no unexplained skips.
- Standard Chromium, Firefox, and WebKit projects pass.
- The Obscura + Playwright lane passes all supported shared tests, and any
  upstream capability gaps remain explicit and actionable.
- Failure artifacts include trace, screenshot, console, and relevant layout
  state.

### Phase 10: Automate CI, Pages, and package publishing

- Add separate CI jobs for formatting, linting, type checks, unit tests,
  compatibility, package contracts, browser tests, benchmarks, and docs.
- Cache native tool and browser downloads without trusting stale build output.
- Test packed tarballs in clean vanilla and React consumer fixtures.
- Validate exports, declarations, source maps, tree-shaking, SSR imports,
  package contents, license files, and zero runtime dependencies.
- Build the website once, test that exact artifact, then deploy it to GitHub
  Pages.
- Configure npm trusted publishing from GitHub Actions using OIDC and minimal
  `id-token: write` permissions.
- Generate npm provenance for public releases.
- Create signed tags/GitHub Releases with generated notes and changelog links.
- Add prerelease channels and a dry-run package workflow for pull requests.
- Verify the public npm package by installing it after publication and running
  minimal vanilla and React smoke consumers.

Exit criteria:

- No long-lived npm automation token is required.
- A tag produces packages, provenance, GitHub Release, and verified npm smoke
  evidence through one auditable workflow.
- Pages deploys only the tested build artifact.
- Failed verification prevents publication and Pages promotion.

### Phase 11: Public release hardening and launch

- Add package-size budgets and API/declaration-diff checks.
- Add fuzz/property tests for bounds, overlap, conservation, and determinism.
- Finish contribution, governance, security, support, and release docs.
- Run an external-consumer usability pass from only README and public docs.
- Audit all claims, badges, links, examples, generated assets, and licenses.
- Publish a release candidate and resolve its feedback before a stable release.
- Announce only after npm, GitHub Release, and GitHub Pages are independently
  verified from public URLs.

Exit criteria:

- A consumer can use the core and React adapter without reading extraction
  source or private notes.
- Public exports are intentional and documented.
- The release contains license, changelog, provenance, security policy, working
  examples, complete docs, and verified public artifacts.

## Verification Strategy

### Unit invariants

- Items remain inside bounded canvases.
- Scrollable canvases allow vertical growth without invalid negative positions.
- Accepted layouts do not introduce unintended overlap.
- Item count and identifiers are conserved unless an operation explicitly adds
  or removes an item.
- Minimum/fixed constraints are respected.
- Inputs are not mutated.
- Equal inputs and options produce equal outputs.

### Compatibility

- Run imported golden fixtures against Gridla.
- Compare normalized outputs rather than snapshots containing incidental field
  order.
- Maintain an explicit allowlist for intentional behavior changes.

### Property and fuzz testing

- Generate bounded canvases, valid item sets, and operation sequences.
- Assert bounds, non-overlap, identifier conservation, and determinism after
  every accepted operation.
- Persist minimal reproductions for every discovered failure.

### Browser acceptance

Browser tests belong to the React adapter. Cover:

- pointer capture and cancellation;
- cursor-locked previews;
- move and resize commits;
- modifier-key snap bypass;
- nested and cross-container movement;
- viewport resize projection;
- scrollable layouts;
- selection and focus behavior;
- server-render/import safety.

Run the interaction corpus through the shared Playwright API in the standard
browser matrix and the Obscura CDP lane. Test the built gallery and studio,
not a development-only substitute. Assert behavior and geometry numerically;
use screenshots for visual contracts rather than as the sole functional oracle.

### Documentation, demos, and visual quality

- Build every code sample and fail on stale imports.
- Crawl the production static artifact for broken links, missing assets, and
  invalid base-path URLs.
- Test navigation, search, deep links, playground URL state, theme selection,
  and reduced motion.
- Capture reviewed screenshots at representative phone, tablet, desktop, and
  wide-screen sizes in light and dark modes.
- Run accessibility checks plus manual keyboard and screen-reader-oriented
  review of the primary journeys.
- Track LCP, CLS, INP-oriented interaction latency, JavaScript weight, image
  weight, and font behavior against explicit budgets.

### Package and public-delivery verification

- Inspect packed tarballs rather than testing only workspace source.
- Install tarballs into clean ESM vanilla and React fixtures.
- Verify subpath exports, declaration resolution, source maps, side-effect
  metadata, tree-shaking, SSR imports, and absence of undeclared dependencies.
- Confirm the core can be imported where `window`, `document`, and React do not
  exist.
- After publishing, install from the public registry by exact version and rerun
  smoke consumers.
- Fetch the public GitHub Pages URL and confirm the deployed revision and asset
  integrity.

### Performance

- Port the existing canvas benchmark to neutral fixtures.
- Track median and high-percentile operation time by item count.
- Include nested groups and worst-case collision chains.
- Record allocation counts or memory deltas where practical.
- Establish a regression budget before release.

## Explicit Non-goals for the Core

- Rendering components or widget content.
- Owning application state or persistence.
- Implementing HTML5 DnD or choosing a DnD library.
- Handling pointer events directly.
- Styling selection, hover, resize, or drop chrome.
- Knowing about React, any state library, JSON Render, Radix, or any consumer
  registry types.
- Translating labels or providing application menus.
- Encoding source-specific detach, tabs, or widget rules without evidence that
  they are generally reusable.

## Risks and Mitigations

### Accidental public API expansion

The current solver contains many specialized internal strategies. Export only
the top-level intent operations initially. Keep push/swap/shrink helpers private
until a real consumer needs direct access.

### Behavior drift during cleanup

Extract with compatibility fixtures first. Defer algorithm cleanup and naming
changes inside implementation until parity is established.

### Product rules leaking into core

Require every proposed core field to be explainable without referring to a
particular product, widget, or page. Use adapter callbacks and generic policies
for consumer interpretation.

### React adapter becoming mandatory

Keep package exports and CI dependency checks strict. Test the core in a small
vanilla JavaScript application and in a Node process.

### Context update fan-out

Putting the complete live interaction state directly into React context would
rerender every consumer on every pointer update. Keep the context value stable,
subscribe through `useSyncExternalStore`, expose focused selector hooks, and
store non-rendering transient values in refs. Add render-count tests for this
contract.

### Obscura CDP compatibility

Obscura is a young independent browser engine, not another Playwright-managed
Chromium channel. Required CDP or web-platform behavior may lag. Prove the
needed capability set early, pin the verified artifact, keep minimal repros for
gaps, and retain standard Chromium/Firefox/WebKit as the authoritative browser
gate. Never weaken assertions merely to make the fast lane green.

### Demo and documentation sprawl

A large gallery can become repetitive or stale. Build demos from shared,
public-API-only primitives; compile displayed snippets; give every demo a
single stated learning goal; and require docs/API/example updates in the same
change whenever a public contract moves.

### Visual polish hiding weak usability

Treat aesthetics, accessibility, and performance as simultaneous constraints.
Every visual review must include keyboard use, narrow layouts, reduced motion,
loading behavior, and interaction responsiveness.

### Unstable serialization contract

Distinguish runtime solver annotations from durable layout data. Document which
fields are serializable and ensure transient effects are returned separately.

### Premature `1.0`

Release initial versions as `0.x`. Exercise the API through the vanilla and
React examples before stabilizing it.

## Open Decisions

- Final project and npm package name.
- License.
- Whether nested-tree support ships in the first release or follows the flat
  engine.
- Normalized node model versus traversal callbacks.
- Whether the React adapter provides rendering primitives or hooks only.
- Whether multiple grids share one provider or use one provider per interaction
  boundary.
- Whether cross-container DnD is a public optional React feature or remains a
  recipe/application concern.
- ESM-only versus dual-module publishing.
- Supported browser and Node versions.
- Whether schema validation is consumer-owned or offered as a separate optional
  entry point.

## Definition of Done

The open-source project delivery is complete when:

- `gridla` is a dependency-free, framework-neutral runtime package;
- `gridla/react` is optional, has no third-party runtime dependencies, and
  carries all React/browser interaction code;
- the core has no DnD dependency and handles no DOM interaction events;
- the vanilla and React examples exercise the same engine;
- the polished Rspress documentation, playground, and demo gallery are live on
  GitHub Pages;
- the React studio delivers the complete page-builder-quality example without
  JSON-driven UI infrastructure;
- every applicable source browser test has been ported and the disposition
  ledger accounts for the rest;
- Playwright's standard browser matrix and the Obscura CDP lane are green within
  their documented capability contracts;
- compatibility, invariant, browser, package, and benchmark checks pass;
- public npm packages, provenance, tags, GitHub Release, and post-publish smoke
  verification are complete;
- README, documentation, demos, and public assets meet the visual,
  accessibility, responsive, and performance acceptance criteria;
- the repository is licensed, documented, versioned, and ready for public
  contribution.
