<!-- Test fixture: an outer canvas whose `group` item hosts an inner provider, inside one transfer scope. -->
<script lang="ts">
  import type { GridItem as GridItemModel, GridLayout } from 'gridla'
  import type { GridChangeDetail } from 'gridla/interaction'
  import { GridCanvas, GridItem, GridProvider, GridTransferScope } from 'gridla/svelte'

  type Props = {
    outer: GridLayout
    inner: GridLayout
    onOuterChange?: (layout: GridLayout, detail: GridChangeDetail) => void
    onInnerChange?: (layout: GridLayout, detail: GridChangeDetail) => void
    onTransferOut?: (itemId: string, targetId: string) => void
    onTransferIn?: (item: GridItemModel, sourceId: string) => void
  }

  let { outer, inner, onOuterChange, onInnerChange, onTransferOut, onTransferIn }: Props = $props()

  let outerLayout = $state(outer)
  let innerLayout = $state(inner)

  export function getOuter(): GridLayout {
    return outerLayout
  }
  export function getInner(): GridLayout {
    return innerLayout
  }
</script>

<GridTransferScope>
  <GridProvider
    id="outer"
    bind:layout={outerLayout}
    responsive={false}
    onLayoutChange={onOuterChange}
    {onTransferOut}
    {onTransferIn}
  >
    <GridCanvas class="outer">
      {#each outerLayout.items as item (item.id)}
        {#if item.id === 'group'}
          <GridItem id="group" class="group" draggable={false}>
            <GridProvider
              id="inner"
              bind:layout={innerLayout}
              responsive={false}
              onLayoutChange={onInnerChange}
              {onTransferOut}
              {onTransferIn}
            >
              <GridCanvas class="inner" style="position:absolute;inset:0">
                {#each innerLayout.items as child (child.id)}
                  <GridItem id={child.id} class="item" />
                {/each}
              </GridCanvas>
            </GridProvider>
          </GridItem>
        {:else}
          <GridItem id={item.id} class="item" />
        {/if}
      {/each}
    </GridCanvas>
  </GridProvider>
</GridTransferScope>
