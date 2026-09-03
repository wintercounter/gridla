<!--
@component
Lets items move between every `GridProvider` rendered inside it. The pointer
decides the target: the deepest registered canvas under the pointer that
accepts the item previews the drop; releasing there commits it. Wraps a
`TransferScope` from `gridla/interaction` in context.
-->
<script lang="ts">
  import { createTransferScope } from 'gridla/interaction'

  import { setTransferScopeContext } from './context.svelte.js'
  import type { GridTransferScopeProps } from './types.js'

  let { children }: GridTransferScopeProps = $props()

  setTransferScopeContext(createTransferScope())
</script>

{@render children?.()}
