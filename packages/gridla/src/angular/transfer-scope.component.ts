import { Component } from '@angular/core'

import { provideGridTransferScope } from './provide'

/**
 * Lets items move between every provider rendered inside it. The pointer
 * decides the target: the deepest registered canvas under the pointer that
 * accepts the item previews the drop; releasing there commits it. Use it as
 * an element (`<gridla-transfer-scope>`) or an attribute
 * (`[gridlaTransferScope]`); it renders no box of its own.
 */
@Component({
  selector: 'gridla-transfer-scope, [gridlaTransferScope]',
  template: '<ng-content />',
  providers: provideGridTransferScope(),
  host: { style: 'display: contents' },
})
// oxlint-disable-next-line typescript/no-extraneous-class
export class GridTransferScopeComponent {}
