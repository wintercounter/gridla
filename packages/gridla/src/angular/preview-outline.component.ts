import { Component, computed, inject, input } from '@angular/core'

import type { GridRect } from 'gridla'
import { GridController } from './controller'

/**
 * A box where the active item will land when released. Hidden
 * (`display: none`) when no gesture is in progress. Style it through the
 * `data-gridla-preview` attribute.
 */
@Component({
  selector: 'gridla-preview-outline',
  exportAs: 'gridlaPreviewOutline',
  template: '',
  host: {
    'data-gridla-preview': '',
    '[style.display]': 'rect() ? "block" : "none"',
    '[style.pointer-events]': '"none"',
    '[style.box-sizing]': '"border-box"',
    '[style.position]': '"absolute"',
    '[style.left.px]': 'positioning() === "absolute" ? (rect()?.x ?? 0) : 0',
    '[style.top.px]': 'positioning() === "absolute" ? (rect()?.y ?? 0) : 0',
    '[style.width.px]': 'rect()?.w ?? 0',
    '[style.height.px]': 'rect()?.h ?? 0',
    '[style.transform]': 'transform()',
  },
})
export class GridPreviewOutlineComponent {
  /** Position with `transform` (default) or with `left`/`top`. */
  readonly positioning = input<'transform' | 'absolute'>('transform')

  private readonly controller = inject(GridController)

  /** The preview rectangle, or `null` when there is nothing to show. */
  readonly rect = computed<GridRect | null>(() => {
    const preview = this.controller.preview()
    if (!preview || !preview.accepted) return null
    const { x, y, w, h } = preview.item
    return { x, y, w, h }
  })

  protected readonly transform = computed(() => {
    const rect = this.rect()
    if (!rect || this.positioning() === 'absolute') return null
    return `translate(${rect.x}px, ${rect.y}px)`
  })
}
