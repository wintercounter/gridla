import type { ComponentType } from 'react'

// Styles owned by individual demos (nested groups, cross-container transfer).
// oxlint-disable-next-line import/no-unassigned-import
import './demos.css'

import { StaticLayoutDemo } from './01-static-layout'
import { ResponsiveProjectionDemo } from './02-responsive-projection'
import { SizingModesDemo } from './03-sizing-modes'
import { ConstraintsDemo } from './04-constraints'
import { PaddingGapsDemo } from './05-padding-gaps'
import { HeightModesDemo } from './06-height-modes'
import { ProgrammaticOpsDemo } from './07-programmatic-ops'
import { SnapAlignmentDemo } from './08-snap-alignment'
import { StrategyComparisonDemo } from './09-strategy-comparison'
import { PoliciesDemo } from './10-policies'
import { NestedGroupsDemo } from './11-nested-groups'
import { CrossTransferDemo } from './12-cross-transfer'
import { ReactUncontrolledDemo } from './13-react-uncontrolled'
import { ReactPersistenceDemo } from './14-react-persistence'
import { ReactCustomChromeDemo } from './15-react-custom-chrome'
import { ReactInputDemo } from './16-react-input'
import { ReactMultiGridDemo } from './17-react-multi-grid'
import { ReactSsrDemo } from './18-react-ssr'
import { ReactStressDemo } from './19-react-stress'
import { ReactPresetsDemo } from './20-react-presets'

export type DemoEntry = {
  id: string
  number: number
  title: string
  /** One-sentence learning goal. */
  goal: string
  tags: string[]
  group: 'core' | 'react'
  component: ComponentType
}

const list: (Omit<DemoEntry, 'number' | 'group'> & { group?: DemoEntry['group'] })[] = [
  {
    id: 'static-layout',
    title: 'Static layout and projection',
    goal: 'See how an authored layout is a plain object, and how projecting it to another canvas keeps rows, columns and alignment.',
    tags: ['projectLayout', 'GridLayout', 'coordinates'],
    component: StaticLayoutDemo,
  },
  {
    id: 'responsive-projection',
    title: 'Responsive projection',
    goal: 'Watch the same layout re-project onto a measured container as it changes size, without any DOM measurement in the engine.',
    tags: ['projectLayout', 'ResizeObserver', 'responsive'],
    component: ResponsiveProjectionDemo,
  },
  {
    id: 'sizing-modes',
    title: 'Sizing modes',
    goal: 'Compare free, fixed-width, fixed-height and fixed items when the canvas changes size.',
    tags: ['sizeMode', 'projectLayout', 'fixed'],
    component: SizingModesDemo,
  },
  {
    id: 'constraints',
    title: 'Minimum and maximum constraints',
    goal: 'Learn how minW, minH, maxW and maxH clamp a resize and how the solver reports what it did.',
    tags: ['resizeItem', 'minW', 'maxW', 'constraints'],
    component: ConstraintsDemo,
  },
  {
    id: 'padding-gaps',
    title: 'Padding and gaps',
    goal: 'Configure per-side canvas padding and an independent item gap, and see the inner rect the solver works against.',
    tags: ['padding', 'gap', 'canvasInnerRect', 'applyGap'],
    component: PaddingGapsDemo,
  },
  {
    id: 'height-modes',
    title: 'Bounded versus scrollable canvases',
    goal: 'Understand when a placement is rejected in a bounded canvas and how a scrollable canvas grows instead.',
    tags: ['heightMode', 'placeItem', 'fitCanvasToContent'],
    component: HeightModesDemo,
  },
  {
    id: 'programmatic-ops',
    title: 'Programmatic move, resize and place',
    goal: 'Drive the solver without a pointer and read accepted or rejected results with their strategy name.',
    tags: ['moveItem', 'resizeItem', 'placeItem', 'SolveResult'],
    component: ProgrammaticOpsDemo,
  },
  {
    id: 'snap-alignment',
    title: 'Snap distance and alignment',
    goal: 'Tune the snap distance, switch snapping off, and see which sibling edges the solved item aligned to.',
    tags: ['snapDistance', 'snap', 'moveItem', 'guides'],
    component: SnapAlignmentDemo,
  },
  {
    id: 'strategy-comparison',
    title: 'Push, swap, reorder and shrink',
    goal: 'Watch four scripted moves side by side and learn which layout shape makes the solver push, swap, reorder or shrink.',
    tags: ['moveItem', 'strategy', 'push', 'swap', 'reorder', 'shrink'],
    component: StrategyComparisonDemo,
  },
  {
    id: 'policies',
    title: 'Locked and ghost policies',
    goal: 'See how a locked item blocks without moving and how an ignored-collision item lets everything pass through.',
    tags: ['policy', 'locked', 'collision: ignore', 'moveItem'],
    component: PoliciesDemo,
  },
  {
    id: 'nested-groups',
    title: 'Nested groups and coordinates',
    goal: 'Groups are items that host their own canvas: drag tiles within and between them, lock a subtree, and read each item’s root rect next to its canonical one.',
    tags: ['GridTransferScope', 'flattenLayout', 'GridNode', 'FlatItem', 'locked'],
    group: 'react',
    component: NestedGroupsDemo,
  },
  {
    id: 'cross-transfer',
    title: 'Cross-container transfer',
    goal: 'Drag items between two canvases of different scale inside one GridTransferScope, or make the same move with a single transferItem call.',
    tags: ['GridTransferScope', 'transferItem', 'TransferResult', 'onTransferIn'],
    group: 'react',
    component: CrossTransferDemo,
  },
  {
    id: 'react-uncontrolled',
    title: 'Uncontrolled GridProvider',
    goal: 'Start with defaultLayout and let the provider own state; observe every change through onLayoutChange.',
    tags: ['GridProvider', 'defaultLayout', 'onLayoutChange'],
    component: ReactUncontrolledDemo,
  },
  {
    id: 'react-persistence',
    title: 'Controlled state and persistence',
    goal: 'Keep the layout in your own state, save it to localStorage on every change, and load or clear it on demand.',
    tags: ['GridProvider', 'layout', 'localStorage', 'GridChangeDetail'],
    component: ReactPersistenceDemo,
  },
  {
    id: 'react-custom-chrome',
    title: 'Custom item renderer and chrome',
    goal: 'Render your own item markup, selection ring and resize knobs using the headless render props.',
    tags: ['GridItem', 'getResizeHandleProps', 'dragHandleProps'],
    component: ReactCustomChromeDemo,
  },
  {
    id: 'react-input',
    title: 'Pointer, touch, keyboard and modifiers',
    goal: 'Try every input path the canvas supports and watch a live readout of the last gesture and modifier.',
    tags: ['useGridInteraction', 'keyboard', 'modifiers', 'touch'],
    component: ReactInputDemo,
  },
  {
    id: 'react-multi-grid',
    title: 'Multiple grids and transfer boundaries',
    goal: 'Compare two isolated providers with a pair that shares a GridTransferScope and accepts drops from each other.',
    tags: ['GridTransferScope', 'acceptTransfers', 'onTransferIn'],
    component: ReactMultiGridDemo,
  },
  {
    id: 'react-ssr',
    title: 'Server-render safe React',
    goal: 'Render the same tree to a string with react-dom/server and hydrate it, proving the adapter is import-safe without a DOM.',
    tags: ['renderToString', 'hydrateRoot', 'responsive={false}'],
    component: ReactSsrDemo,
  },
  {
    id: 'react-stress',
    title: 'Stress and performance',
    goal: 'Drag through hundreds of items while watching frame rate and per-solve time reported through onTrace.',
    tags: ['onTrace', 'performance.now', 'positioning'],
    component: ReactStressDemo,
  },
  {
    id: 'react-presets',
    title: 'Import, export and presets',
    goal: 'Round-trip a layout through JSON and rebuild it with rows, columns or grid presets from a thumbnail gallery.',
    tags: ['applyPreset', 'JSON', 'setLayout'],
    component: ReactPresetsDemo,
  },
]

export const demos: DemoEntry[] = list.map((entry, index) => ({
  ...entry,
  number: index + 1,
  group: entry.group ?? (index < 12 ? 'core' : 'react'),
}))
