<!--
@component
Renders a box where the active item will land when released. Renders nothing
when no gesture is in progress.
-->
<script lang="ts">
  import type { GridRect } from 'gridla'

  import { gridStore } from './context.svelte.js'
  import type { GridPreviewOutlineProps } from './types.js'
  import { joinStyle, rectStyle, rectsEqual } from './view.js'

  let { positioning = 'transform', style, ...rest }: GridPreviewOutlineProps = $props()

  const rect = gridStore<unknown, GridRect | null>((state) => {
    if (!state.preview || !state.preview.accepted) return null
    const item = state.preview.item
    return { x: item.x, y: item.y, w: item.w, h: item.h }
  }, rectsEqual)
</script>

{#if rect.current}
  <div
    data-gridla-preview=""
    {...rest}
    style={joinStyle(
      'pointer-events:none;box-sizing:border-box',
      rectStyle(rect.current, positioning),
      style,
    )}
  ></div>
{/if}
