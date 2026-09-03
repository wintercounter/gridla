<!-- Test fixture: owns a layout with `$state` and binds it into the dashboard (`bind:layout`). -->
<script lang="ts">
  import type { GridLayout } from 'gridla'
  import type { GridChangeDetail } from 'gridla/interaction'

  import Dashboard from './SvelteDashboard.svelte'

  type Props = {
    initial: GridLayout
    onLayoutChange?: (layout: GridLayout, detail: GridChangeDetail) => void
  }

  let { initial, onLayoutChange }: Props = $props()
  let layout = $state(initial)

  /** Replace the bound layout from outside (parent to child direction). */
  export function setLayout(next: GridLayout) {
    layout = next
  }

  /** The bound layout as the parent sees it. */
  export function getLayout(): GridLayout {
    return layout
  }
</script>

<Dashboard bind:layout {onLayoutChange} ids={layout.items.map((item) => item.id)} />
<pre data-testid="json">{JSON.stringify(layout.items.map((item) => [item.id, item.x, item.y]))}</pre>
