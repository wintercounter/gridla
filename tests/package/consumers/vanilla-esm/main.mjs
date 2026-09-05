// Plain ESM consumer of the published `gridla` package. Runs under both Node and
// Bun with no DOM, no React, and no bundler. Exercises the core entry only.
import assert from 'node:assert/strict'

assert.equal(typeof window, 'undefined', 'fixture must run without a DOM')
assert.equal(typeof document, 'undefined', 'fixture must run without a DOM')
assert.equal(typeof globalThis.React, 'undefined', 'fixture must run without React')

const gridla = await import('gridla')
const { createItem, moveItem, projectLayout, flattenLayout, layoutIsValid, boundsFromCanvas } =
  gridla

for (const name of ['createItem', 'moveItem', 'projectLayout', 'flattenLayout']) {
  assert.equal(typeof gridla[name], 'function', `gridla exports ${name}`)
}

const canvas = {
  width: 400,
  height: 300,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  heightMode: 'bounded',
}
const a = createItem('a', { w: 100, h: 100 }, 0, 0)
const b = createItem('b', { w: 100, h: 100 }, 200, 0)
const layout = { canvas, items: [a, b] }

assert.deepEqual(
  { id: a.id, x: a.x, y: a.y, w: a.w, h: a.h },
  { id: 'a', x: 0, y: 0, w: 100, h: 100 },
)
assert.ok(
  layoutIsValid(layout.items, boundsFromCanvas(layout.canvas), 0),
  'fixture layout is valid',
)

// moveItem: free space, must be accepted and must not mutate the input.
const moved = moveItem({ layout, itemId: 'a', position: { x: 300, y: 0 } })
assert.equal(moved.accepted, true, 'move into free space is accepted')
assert.equal(moved.item.x, 300)
assert.equal(moved.layout.items.find((item) => item.id === 'a')?.x, 300)
assert.equal(layout.items[0].x, 0, 'moveItem does not mutate the input layout')
assert.ok(
  layoutIsValid(moved.layout.items, boundsFromCanvas(moved.layout.canvas), 0),
  'moved layout is valid',
)

// projectLayout: onto a wider canvas, items stay in bounds and keep their order.
const projected = projectLayout(layout, { width: 800 })
assert.equal(projected.canvas.width, 800)
assert.equal(projected.items.length, 2)
for (const item of projected.items) {
  assert.ok(item.x >= 0 && item.x + item.w <= 800, `${item.id} stays inside the target canvas`)
}
const [pa, pb] = ['a', 'b'].map((id) => projected.items.find((item) => item.id === id))
assert.ok(pb.x > pa.x, 'projection preserves horizontal order')
assert.ok(pb.x >= 200, 'projection scales positions with the canvas')

// flattenLayout: a root container with two leaves.
const root = {
  id: 'root',
  layout,
  children: [{ id: 'a' }, { id: 'b' }],
}
const flat = flattenLayout(root, { x: 0, y: 0, w: 400, h: 300 })
assert.equal(flat.rootId, 'root')
assert.equal(flat.items.length, 3, 'root + two leaves')
const flatB = flat.itemsById.get('b')
assert.ok(flatB, 'leaf b is in the flat layout')
assert.equal(flatB.parentId, 'root')
assert.equal(flatB.depth, 1)
assert.deepEqual(flatB.rect, { x: 200, y: 0, w: 100, h: 100 })
assert.deepEqual([...(flat.childrenByParentId.get('root') ?? [])], ['a', 'b'])

console.log(
  `vanilla-esm ok (${typeof Bun === 'undefined' ? `node ${process.version}` : `bun ${Bun.version}`})`,
)
