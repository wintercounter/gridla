<!--
@component
Positions one item inside `GridCanvas`. Headless: it renders a `div` with
geometry styles and data attributes and leaves appearance to you. The
children snippet receives the item view plus drag and resize handle
attributes.
-->
<script lang="ts">
  import type { GridResizeEdge } from 'gridla'

  import { gridItemView } from './context.svelte.js'
  import type { GridItemProps, GridItemRenderProps } from './types.js'
  import { joinStyle, rectStyle, resizeHandleStyle } from './view.js'

  let {
    id,
    draggable = true,
    resizeEdges,
    resizeHandleClass,
    positioning = 'transform',
    followPointer = true,
    children,
    style,
    ...rest
  }: GridItemProps = $props()

  const view = gridItemView(() => id)

  const dragHandleProps = $derived({ 'data-gridla-drag-handle': id })
  const getResizeHandleProps = (edge: GridResizeEdge) => ({
    'data-gridla-resize-handle': id,
    'data-gridla-edge': edge,
  })

  const shownRect = $derived(
    view.current.isActive &&
      followPointer &&
      view.current.activeRect &&
      view.current.interaction?.mode === 'move'
      ? view.current.activeRect
      : view.current.rect,
  )
  const itemStyle = $derived(
    joinStyle(
      'box-sizing:border-box',
      rectStyle(shownRect, positioning),
      view.current.isActive ? 'z-index:2' : null,
      view.current.isTransferring ? 'opacity:0.4' : null,
      style,
    ),
  )
  const renderProps = $derived<GridItemRenderProps>({
    ...view.current,
    dragHandleProps,
    getResizeHandleProps,
  })
</script>

<div
  {...rest}
  {...draggable ? dragHandleProps : {}}
  data-gridla-item={id}
  data-gridla-active={view.current.isActive ? '' : undefined}
  data-gridla-selected={view.current.isSelected ? '' : undefined}
  data-gridla-shifted={view.current.isShifted ? '' : undefined}
  data-gridla-transferring={view.current.isTransferring ? '' : undefined}
  style={itemStyle}
>
  {@render children?.(renderProps)}
  {#each resizeEdges ?? [] as edge (edge)}
    <div
      {...resizeHandleClass ? { class: resizeHandleClass } : {}}
      {...getResizeHandleProps(edge)}
      style={resizeHandleStyle(edge)}
    ></div>
  {/each}
</div>
