/**
 * Property inspector for the selection: geometry and constraints through the
 * owning provider's actions (so the solver keeps the layout valid), content
 * and group settings through the document reducer.
 */

import { useCallback, useId, useState, useSyncExternalStore, type ReactNode } from 'react'

import { isLocked, type GridItem, type GridSizeMode, type LayoutPreset } from 'gridla'

import { useCanvasRegistry, type CanvasEntry } from '../canvas-registry'
import { findNode, type StudioNode } from '../document'
import { getKind, type FieldSpec, type NodeProps } from '../registry'
import { selectionInfo, useStudio } from '../store'

// ---------------------------------------------------------------------------
// Field primitives
// ---------------------------------------------------------------------------

function Field({
  label,
  children,
  help,
}: {
  label: ReactNode
  children: ReactNode
  help?: string
}) {
  return (
    <label className="st-field" title={help}>
      <span className="st-field-label">{label}</span>
      {children}
    </label>
  )
}

function NumberField({
  label,
  value,
  onCommit,
  min,
  max,
  step = 1,
  placeholder,
  help,
}: {
  label: ReactNode
  value: number | undefined
  onCommit: (value: number | undefined) => void
  min?: number
  max?: number
  step?: number
  placeholder?: string
  help?: string
}) {
  const formatted = value === undefined ? '' : String(Math.round(value))
  const [draft, setDraft] = useState(formatted)
  const [seen, setSeen] = useState(formatted)
  if (seen !== formatted) {
    // The item changed underneath us (drag, undo): drop the stale draft.
    setSeen(formatted)
    setDraft(formatted)
  }
  const commit = () => {
    if (draft.trim() === '') {
      if (value !== undefined) onCommit(undefined)
      return
    }
    const next = Number(draft)
    if (!Number.isFinite(next)) {
      setDraft(value === undefined ? '' : String(Math.round(value)))
      return
    }
    if (next !== value) onCommit(next)
  }
  return (
    <Field label={label} help={help}>
      <input
        className="st-input st-input-number"
        type="number"
        inputMode="numeric"
        value={draft}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit()
            event.currentTarget.blur()
          }
        }}
      />
    </Field>
  )
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  help,
}: {
  label: ReactNode
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  help?: string
}) {
  return (
    <Field label={label} help={help}>
      <select
        className="st-input"
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

function ToggleField({
  label,
  checked,
  onChange,
  help,
}: {
  label: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  help?: string
}) {
  return (
    <label className="st-toggle" title={help}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="st-panel-section">
      <h3 className="st-panel-title">{title}</h3>
      {children}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Live item geometry from the owning provider
// ---------------------------------------------------------------------------

function useCanvasEntry(groupId: string | null): CanvasEntry | null {
  const registry = useCanvasRegistry()
  return useSyncExternalStore(
    registry.subscribe,
    () => (groupId ? registry.get(groupId) : null),
    () => null,
  )
}

function useRenderedItem(entry: CanvasEntry | null, id: string, fallback: GridItem | null) {
  const subscribe = useCallback(
    (listener: () => void) => (entry ? entry.subscribe(listener) : () => {}),
    [entry],
  )
  const get = useCallback(
    () => (entry ? (entry.getLayout().items.find((item) => item.id === id) ?? fallback) : fallback),
    [entry, id, fallback],
  )
  return useSyncExternalStore(subscribe, get, get)
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const SIZE_MODES: readonly { value: GridSizeMode; label: string }[] = [
  { value: 'free', label: 'Free (scales both ways)' },
  { value: 'fixed-w', label: 'Fixed width' },
  { value: 'fixed-h', label: 'Fixed height' },
  { value: 'fixed', label: 'Fixed size' },
]

function GeometrySection({ entry, item }: { entry: CanvasEntry | null; item: GridItem }) {
  const locked = isLocked(item)
  const move = (patch: Partial<{ x: number; y: number }>) =>
    entry?.actions.move(item.id, { x: patch.x ?? item.x, y: patch.y ?? item.y }, { snap: false })
  const resize = (patch: Partial<{ w: number; h: number }>) =>
    entry?.actions.resize(item.id, { rect: patch }, { snap: false })
  return (
    <Section title="Position and size">
      <div className="st-field-grid">
        <NumberField label="X" value={item.x} onCommit={(x) => x !== undefined && move({ x })} />
        <NumberField label="Y" value={item.y} onCommit={(y) => y !== undefined && move({ y })} />
        <NumberField
          label="W"
          value={item.w}
          min={1}
          onCommit={(w) => w !== undefined && resize({ w })}
        />
        <NumberField
          label="H"
          value={item.h}
          min={1}
          onCommit={(h) => h !== undefined && resize({ h })}
        />
      </div>
      {locked ? (
        <p className="st-panel-hint">Locked items still accept typed values here.</p>
      ) : null}
    </Section>
  )
}

function ConstraintsSection({ entry, item }: { entry: CanvasEntry | null; item: GridItem }) {
  const update = (patch: Partial<GridItem>) => entry?.actions.update(item.id, patch)
  const mode = item.sizeMode ?? 'free'
  return (
    <Section title="Constraints">
      <div className="st-field-grid">
        <NumberField
          label="Min W"
          value={item.minW}
          min={1}
          onCommit={(minW) => update({ minW })}
          placeholder="—"
        />
        <NumberField
          label="Min H"
          value={item.minH}
          min={1}
          onCommit={(minH) => update({ minH })}
          placeholder="—"
        />
        <NumberField
          label="Max W"
          value={item.maxW}
          min={1}
          onCommit={(maxW) => update({ maxW })}
          placeholder="—"
        />
        <NumberField
          label="Max H"
          value={item.maxH}
          min={1}
          onCommit={(maxH) => update({ maxH })}
          placeholder="—"
        />
      </div>
      <SelectField
        label="Size mode"
        value={mode}
        options={SIZE_MODES}
        onChange={(sizeMode) => update({ sizeMode: sizeMode === 'free' ? undefined : sizeMode })}
        help="Which axes keep their pixel size when the page changes width."
      />
      {mode === 'fixed-w' || mode === 'fixed' ? (
        <NumberField
          label="Fixed width"
          value={item.fixedWidth}
          min={1}
          placeholder={String(Math.round(item.w))}
          onCommit={(fixedWidth) => update({ fixedWidth })}
          help="Pixel width to pin. Empty uses the current width."
        />
      ) : null}
      {mode === 'fixed-h' || mode === 'fixed' ? (
        <NumberField
          label="Fixed height"
          value={item.fixedHeight}
          min={1}
          placeholder={String(Math.round(item.h))}
          onCommit={(fixedHeight) => update({ fixedHeight })}
          help="Pixel height to pin. Empty uses the current height."
        />
      ) : null}
    </Section>
  )
}

function BehaviorSection({
  entry,
  item,
  node,
}: {
  entry: CanvasEntry | null
  item: GridItem
  node: StudioNode
}) {
  const { dispatch } = useStudio()
  const update = (patch: Partial<GridItem>) => entry?.actions.update(item.id, patch)
  return (
    <Section title="Behavior">
      <ToggleField
        label="Locked"
        checked={isLocked(item)}
        onChange={() => dispatch({ type: 'toggle-lock', ids: [item.id] })}
        help="A locked item never moves or resizes to make room for others, and cannot be dragged."
      />
      <ToggleField
        label="Hidden"
        checked={!!node.hidden}
        onChange={() => dispatch({ type: 'toggle-hidden', ids: [item.id] })}
        help="Hidden items leave the canvas and the solver but stay in the document."
      />
      <SelectField
        label="Collision"
        value={item.policy?.collision ?? 'solid'}
        options={[
          { value: 'solid', label: 'Solid (blocks others)' },
          { value: 'ignore', label: 'Ignore (others pass through)' },
        ]}
        onChange={(collision) =>
          update({
            policy: { ...item.policy, collision: collision === 'solid' ? undefined : 'ignore' },
          })
        }
      />
    </Section>
  )
}

function GroupSection({ node, isRoot }: { node: StudioNode; isRoot: boolean }) {
  const { dispatch } = useStudio()
  const [columns, setColumns] = useState(2)
  const layout = node.layout
  if (!layout) return null
  const padding = layout.canvas.padding
  const count = (node.children ?? []).filter((child) => !child.hidden).length
  const preset = (kind: LayoutPreset) =>
    dispatch({ type: 'apply-preset', groupId: node.id, preset: kind, columns })
  return (
    <Section title={isRoot ? 'Page canvas' : 'Group canvas'}>
      <div className="st-field-grid">
        <NumberField
          label="Gap"
          value={node.gap ?? 0}
          min={0}
          onCommit={(gap) =>
            dispatch({ type: 'update-group', id: node.id, patch: { gap: gap ?? 0 } })
          }
          help="Minimum distance the solver keeps between children."
        />
        {isRoot ? (
          <NumberField
            label="Min height"
            value={layout.canvas.height}
            min={100}
            onCommit={(height) =>
              height !== undefined &&
              dispatch({ type: 'update-group', id: node.id, patch: { height } })
            }
            help="The page grows below this when content needs it."
          />
        ) : null}
        <NumberField
          label="Pad top"
          value={padding.top}
          min={0}
          onCommit={(top) =>
            dispatch({ type: 'update-group', id: node.id, patch: { padding: { top: top ?? 0 } } })
          }
        />
        <NumberField
          label="Pad right"
          value={padding.right}
          min={0}
          onCommit={(right) =>
            dispatch({
              type: 'update-group',
              id: node.id,
              patch: { padding: { right: right ?? 0 } },
            })
          }
        />
        <NumberField
          label="Pad bottom"
          value={padding.bottom}
          min={0}
          onCommit={(bottom) =>
            dispatch({
              type: 'update-group',
              id: node.id,
              patch: { padding: { bottom: bottom ?? 0 } },
            })
          }
        />
        <NumberField
          label="Pad left"
          value={padding.left}
          min={0}
          onCommit={(left) =>
            dispatch({ type: 'update-group', id: node.id, patch: { padding: { left: left ?? 0 } } })
          }
        />
      </div>
      <div className="st-preset-row">
        <span className="st-field-label">
          Arrange {count} {count === 1 ? 'item' : 'items'}
        </span>
        <div className="st-button-row">
          <button
            type="button"
            className="st-button"
            disabled={count === 0}
            onClick={() => preset('rows')}
          >
            Rows
          </button>
          <button
            type="button"
            className="st-button"
            disabled={count === 0}
            onClick={() => preset('columns')}
          >
            Columns
          </button>
          <button
            type="button"
            className="st-button"
            disabled={count === 0}
            onClick={() => preset('grid')}
          >
            Grid
          </button>
          <input
            className="st-input st-input-number st-input-inline"
            type="number"
            min={1}
            max={8}
            value={columns}
            aria-label="Grid columns"
            onChange={(event) =>
              setColumns(Math.max(1, Math.min(8, Number(event.target.value) || 1)))
            }
          />
        </div>
      </div>
    </Section>
  )
}

function AppearanceSection({ node }: { node: StudioNode }) {
  const { dispatch } = useStudio()
  const spec = getKind(node.kind)
  const set = (props: NodeProps) => dispatch({ type: 'update-props', id: node.id, props })
  if (spec.fields.length === 0) return null
  return (
    <Section title="Content">
      {spec.fields.map((field) => (
        <AppearanceField key={field.key} field={field} props={node.props} onChange={set} />
      ))}
    </Section>
  )
}

function AppearanceField({
  field,
  props,
  onChange,
}: {
  field: FieldSpec
  props: NodeProps
  onChange: (props: NodeProps) => void
}) {
  const id = useId()
  const value = props[field.key]
  switch (field.type) {
    case 'textarea':
      return (
        <Field label={field.label} help={field.help}>
          <textarea
            id={id}
            className="st-input st-textarea"
            rows={4}
            value={String(value ?? '')}
            onChange={(event) => onChange({ [field.key]: event.target.value })}
          />
        </Field>
      )
    case 'select':
      return (
        <SelectField
          label={field.label}
          value={String(value ?? field.options?.[0]?.value ?? '')}
          options={field.options ?? []}
          onChange={(next) => onChange({ [field.key]: next })}
          help={field.help}
        />
      )
    case 'number':
      return (
        <NumberField
          label={field.label}
          value={typeof value === 'number' ? value : undefined}
          min={field.min}
          max={field.max}
          onCommit={(next) => onChange({ [field.key]: next ?? 0 })}
          help={field.help}
        />
      )
    case 'toggle':
      return (
        <ToggleField
          label={field.label}
          checked={Boolean(value)}
          onChange={(next) => onChange({ [field.key]: next })}
          help={field.help}
        />
      )
    default:
      return (
        <Field label={field.label} help={field.help}>
          <input
            id={id}
            className="st-input"
            type="text"
            value={String(value ?? '')}
            onChange={(event) => onChange({ [field.key]: event.target.value })}
          />
        </Field>
      )
  }
}

function ActionsRow({ ids }: { ids: readonly string[] }) {
  const { state, dispatch } = useStudio()
  const items = ids.map((id) => findNode(state.doc.root, id)).filter(Boolean)
  const allLocked = items.length > 0 && items.every((path) => path?.item && isLocked(path.item))
  const allHidden = items.length > 0 && items.every((path) => path?.node.hidden)
  return (
    <div className="st-button-row st-actions">
      <button
        type="button"
        className="st-button"
        onClick={() => dispatch({ type: 'duplicate', ids })}
        title="Ctrl/Cmd + D"
      >
        Duplicate
      </button>
      <button
        type="button"
        className="st-button"
        onClick={() => dispatch({ type: 'toggle-lock', ids })}
        title="Ctrl/Cmd + L"
      >
        {allLocked ? 'Unlock' : 'Lock'}
      </button>
      <button
        type="button"
        className="st-button"
        onClick={() => dispatch({ type: 'toggle-hidden', ids })}
        title="Ctrl/Cmd + H"
      >
        {allHidden ? 'Show' : 'Hide'}
      </button>
      <button
        type="button"
        className="st-button"
        data-variant="danger"
        onClick={() => dispatch({ type: 'remove', ids })}
        title="Delete"
      >
        Delete
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------

export function Inspector() {
  const { state, dispatch } = useStudio()
  const root = state.doc.root
  const { primary, primaryId } = selectionInfo(state)
  const parentId = primary?.parent?.id ?? null
  const entry = useCanvasEntry(parentId)
  const rendered = useRenderedItem(entry, primaryId ?? '', primary?.item ?? null)

  if (state.selection.length > 1) {
    return (
      <div className="st-inspector">
        <Section title={`${state.selection.length} items selected`}>
          <p className="st-panel-hint">
            Delete, duplicate, lock and hide apply to all of them. Move and resize one at a time.
          </p>
          <ActionsRow ids={state.selection} />
        </Section>
      </div>
    )
  }

  if (!primary || primary.node.id === root.id) {
    return (
      <div className="st-inspector">
        <Section title="Page">
          <Field label="Name">
            <input
              className="st-input"
              type="text"
              value={state.doc.name}
              onChange={(event) =>
                dispatch({
                  type: 'replace-document',
                  doc: { ...state.doc, name: event.target.value },
                  history: false,
                })
              }
            />
          </Field>
          <p className="st-panel-hint">
            {root.children?.length
              ? 'Click an item on the canvas or in Layers to edit it.'
              : 'Add blocks from the palette to get started.'}
          </p>
        </Section>
        <GroupSection node={root} isRoot />
      </div>
    )
  }

  const node = primary.node
  const item = rendered ?? primary.item
  const spec = getKind(node.kind)
  return (
    <div className="st-inspector">
      <div className="st-inspector-head">
        <span className="st-inspector-kind">{spec.icon}</span>
        <div>
          <div className="st-inspector-title">
            {String(node.props.title ?? node.props.text ?? node.props.label ?? spec.label)}
          </div>
          <div className="st-inspector-meta">
            {spec.label} · <code>{node.id}</code>
          </div>
        </div>
      </div>
      <ActionsRow ids={[node.id]} />
      {item ? <GeometrySection entry={entry} item={item} /> : null}
      {item ? <ConstraintsSection entry={entry} item={item} /> : null}
      {item ? <BehaviorSection entry={entry} item={item} node={node} /> : null}
      {node.layout ? <GroupSection node={node} isRoot={false} /> : null}
      <AppearanceSection node={node} />
    </div>
  )
}
