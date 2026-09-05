<!--
@component
The element items are positioned in. Measures itself, feeds the size to the
provider, and wires pointer and keyboard handling. Renders a `div` with
`position: relative`; give it a height (or let it follow the layout with
`responsive={false}` on the provider).
-->
<script lang="ts">
  import { createPointerGesture, observeSize } from 'gridla/interaction'

  import { getGridContext, getTransferScopeContext } from './context.svelte.js'
  import type { GridCanvasProps } from './types.js'
  import { joinStyle } from './view.js'

  let {
    children,
    style,
    onItemClick,
    onDeleteKey,
    enabled,
    tabindex = 0,
    ...rest
  }: GridCanvasProps = $props()

  const runes = getGridContext()
  const scope = getTransferScopeContext()
  let element = $state<HTMLDivElement | null>(null)

  const pointer = createPointerGesture(runes.controller, {
    scope,
    getElement: () => element,
  })

  $effect.pre(() => {
    pointer.setOptions({ onItemClick, onDeleteKey, enabled })
  })

  $effect(() => {
    const target = element
    if (!target) return
    runes.gesture.setElement(target)
    const unbindPointer = pointer.bindPointer(target)
    const unbindKeyboard = pointer.bindKeyboard(target)
    return () => {
      unbindPointer()
      unbindKeyboard()
      runes.gesture.setElement(null)
    }
  })

  $effect(() => {
    const target = element
    if (!target || !runes.config.responsive) return
    return observeSize(target, (size) => runes.controller.setSize(size))
  })

  $effect(() => () => pointer.destroy())

  const canvas = $derived(runes.state.layout.canvas)
  const dragging = $derived(runes.state.interaction !== null)
  const canvasStyle = $derived(
    joinStyle(
      'position:relative;box-sizing:border-box;touch-action:none',
      dragging ? 'user-select:none' : null,
      runes.config.responsive
        ? canvas.heightMode === 'scrollable'
          ? `min-height:${canvas.height}px`
          : null
        : `width:${canvas.width}px;height:${canvas.height}px`,
      style,
    ),
  )
</script>

<!-- The canvas is keyboard-operable: arrow keys nudge the selected item. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  bind:this={element}
  data-gridla-canvas=""
  data-gridla-active={dragging ? '' : undefined}
  {tabindex}
  {...rest}
  style={canvasStyle}
>
  {@render children?.()}
</div>
