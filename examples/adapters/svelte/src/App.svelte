<script lang="ts">
  import type { GridLayout } from 'gridla'
  import type { GridChangeDetail } from 'gridla/interaction'
  import {
    GridCanvas,
    GridItem,
    GridPreviewOutline,
    GridProvider,
    GridTransferScope,
  } from 'gridla/svelte'
  import { formatRect } from '@gridla/demo-kit'

  import { innerLayout, outerLayout, type Data } from './layouts'

  let outer = $state<GridLayout<Data>>(outerLayout())
  let inner = $state<GridLayout<Data>>(innerLayout())
  let status = $state('idle')

  const edges = ['e', 's', 'se'] as const

  function report(scope: string) {
    return (detail: GridChangeDetail) => {
      status = `${scope}: ${detail.reason}${detail.itemId ? ` ${detail.itemId}` : ''}${detail.strategy ? ` · ${detail.strategy}` : ''}`
    }
  }

  function reset() {
    outer = outerLayout()
    inner = innerLayout()
    status = 'reset'
  }

  const readout = $derived(
    JSON.stringify(
      {
        outer: outer.items.map((item) => ({ id: item.id, x: item.x, y: item.y, w: item.w, h: item.h })),
        inner: inner.items.map((item) => ({ id: item.id, x: item.x, y: item.y, w: item.w, h: item.h })),
      },
      null,
      2,
    ),
  )
</script>

<main class="page">
  <header class="page-head">
    <div>
      <h1>Gridla with Svelte</h1>
      <p>
        <code>gridla/svelte</code> binds the framework-neutral controller to runes. The outer
        dashboard and the nested canvas inside the group share one
        <code>GridTransferScope</code>, so items move between them; both layouts are bound with
        <code>bind:layout</code> and echoed below.
      </p>
    </div>
    <button type="button" class="page-reset" data-testid="reset" onclick={reset}>Reset</button>
  </header>

  <GridTransferScope>
    <GridProvider bind:layout={outer} gap={12} snapDistance={16} onCommit={report('outer')}>
      <section class="gd-stage" id="stage">
        <GridCanvas class="canvas" onItemClick={(id) => (status = `click ${id}`)}>
          {#each outer.items as item (item.id)}
            {#if item.id === 'group'}
              <GridItem id={item.id} class="gd-item" draggable={false} resizeEdges={edges} resizeHandleClass="gd-handle">
                {#snippet children(view)}
                  <div class="gd-item-head" {...view.dragHandleProps}>
                    <span>{item.data?.label}</span>
                    <span class="gd-item-coords">{formatRect(view.rect)}</span>
                  </div>
                  <div class="gd-item-body group-body">
                    <GridProvider bind:layout={inner} gap={8} onCommit={report('inner')}>
                      <GridCanvas class="nested" style="position:absolute;inset:0">
                        {#each inner.items as child (child.id)}
                          <GridItem id={child.id} class="gd-item" resizeEdges={edges} resizeHandleClass="gd-handle">
                            {#snippet children(childView)}
                              <div class="gd-item-head">
                                <span>{child.data?.label}</span>
                                <span class="gd-item-coords">{formatRect(childView.rect)}</span>
                              </div>
                              <div class="gd-item-body">nested</div>
                            {/snippet}
                          </GridItem>
                        {/each}
                        <GridPreviewOutline class="gd-preview" />
                      </GridCanvas>
                    </GridProvider>
                  </div>
                {/snippet}
              </GridItem>
            {:else}
              <GridItem id={item.id} class="gd-item" resizeEdges={edges} resizeHandleClass="gd-handle">
                {#snippet children(view)}
                  <div class="gd-item-head">
                    <span>{item.data?.label}</span>
                    <span class="gd-item-coords">{formatRect(view.rect)}</span>
                  </div>
                  <div class="gd-item-body">
                    {view.isSelected ? 'selected · arrow keys nudge' : 'drag to move · handles resize'}
                  </div>
                {/snippet}
              </GridItem>
            {/if}
          {/each}
          <GridPreviewOutline class="gd-preview" />
        </GridCanvas>
      </section>
    </GridProvider>
  </GridTransferScope>

  <p class="page-note" data-testid="status">last: {status}</p>
  <pre class="page-json" data-testid="layout-json">{readout}</pre>
</main>
