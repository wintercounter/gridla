<!--
@component
Owns layout and gesture state for one canvas. Place a `GridCanvas` inside it.
Works controlled (`layout` or `bind:layout`, with `onLayoutChange`) or
uncontrolled (`defaultLayout`). A binding over `createGridController` from
`gridla/interaction`; nested layouts are nested providers.
-->
<script lang="ts" generics="TData = unknown">
  import type { GridControllerOptions } from 'gridla/interaction'

  import { createGridRunes, getTransferScopeContext, setGridContext } from './context.svelte.js'
  import type { GridProviderProps } from './types.js'

  let {
    id,
    layout = $bindable(),
    defaultLayout,
    onLayoutChange,
    onCommit,
    onTransferOut,
    onTransferIn,
    acceptTransfers,
    responsive,
    dragThreshold,
    keyboardStep,
    gap,
    snapDistance,
    snap,
    onTrace,
    selectedId,
    onSelectedIdChange,
    children,
  }: GridProviderProps<TData> = $props()

  const scope = getTransferScopeContext()

  const options = (): GridControllerOptions<TData> => ({
    id,
    layout,
    defaultLayout,
    // A controlled layout follows every accepted change through the binding;
    // the caller's callback still fires with the same layout and detail.
    onLayoutChange: (next, detail) => {
      if (layout !== undefined) layout = next
      onLayoutChange?.(next, detail)
    },
    onCommit: (detail) => onCommit?.(detail),
    onTransferOut: (itemId, targetId) => onTransferOut?.(itemId, targetId),
    onTransferIn: (item, sourceId) => onTransferIn?.(item, sourceId),
    acceptTransfers,
    scope,
    responsive,
    dragThreshold,
    keyboardStep,
    gap,
    snapDistance,
    snap,
    onTrace,
    selectedId,
    onSelectedIdChange: (itemId) => onSelectedIdChange?.(itemId),
  })

  const runes = setGridContext(createGridRunes<TData>(options()))

  // Forward prop changes before the DOM updates. The controller compares and
  // only touches the store when something changed.
  $effect.pre(() => {
    runes.setOptions(options())
  })

  $effect(() => () => runes.destroy())
</script>

{@render children?.()}
