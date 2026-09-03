<!-- Test fixture: a provider, canvas, items with e/s/se resize handles, and the preview outline. -->
<script lang="ts">
  import type { GridLayout } from 'gridla'
  import type { GridChangeDetail } from 'gridla/interaction'
  import { GridCanvas, GridItem, GridPreviewOutline, GridProvider } from 'gridla/svelte'

  type Props = {
    layout?: GridLayout
    defaultLayout?: GridLayout
    onLayoutChange?: (layout: GridLayout, detail: GridChangeDetail) => void
    onCommit?: (detail: GridChangeDetail) => void
    onItemClick?: (itemId: string) => void
    responsive?: boolean
    ids: string[]
  }

  let {
    layout = $bindable(),
    defaultLayout,
    onLayoutChange,
    onCommit,
    onItemClick,
    responsive = false,
    ids,
  }: Props = $props()
</script>

<GridProvider bind:layout {defaultLayout} {onLayoutChange} {onCommit} {responsive}>
  <GridCanvas {onItemClick} class="canvas">
    {#each ids as id (id)}
      <GridItem {id} resizeEdges={['e', 's', 'se']} class="item">
        {#snippet children(view)}
          <span class="label">{id}</span>
          <span class="coords">{view.rect.x},{view.rect.y}</span>
        {/snippet}
      </GridItem>
    {/each}
    <GridPreviewOutline class="preview" />
  </GridCanvas>
</GridProvider>
