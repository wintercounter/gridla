import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// JIT: templates compile at runtime, so the compiler must load before any
// component is created. Angular resolves through the `@angular/*` path mapping
// in the root tsconfig (the packages are devDependencies of `packages/gridla`).
import '@angular/compiler'
import {
  Component,
  Injector,
  createComponent,
  createEnvironmentInjector,
  type EnvironmentInjector,
  provideZonelessChangeDetection,
  runInInjectionContext,
  signal,
  type ApplicationRef,
  type ComponentRef,
} from '@angular/core'
import { createApplication } from '@angular/platform-browser'

import type * as AngularAdapter from 'gridla/angular'

import { createItem, type GridLayout } from 'gridla'
import { createTransferScope, type GridChangeDetail } from 'gridla/interaction'
import {
  GRIDLA_OPTIONS,
  GRID_TRANSFER_SCOPE,
  GridController,
  injectGridActions,
  injectGridController,
  injectGridItemView,
  injectGridStore,
  provideGridTransferScope,
  provideGridla,
  type GridLayoutChangeEvent,
} from 'gridla/angular'

// The component suite runs against the built FESM: partial Ivy declarations
// carry the input and output metadata that the JIT compiler needs, which the
// TypeScript sources only get through the Angular compiler (ng-packagr).
// Run `bun run build` first; without `dist/angular` the suite is skipped.
const FESM = resolve(
  import.meta.dir,
  '../../packages/gridla/dist/angular/fesm2022/gridla-angular.mjs',
)

const padding = { top: 0, right: 0, bottom: 0, left: 0 }

function layoutFixture(): GridLayout {
  return {
    canvas: { width: 1000, height: 600, padding, heightMode: 'bounded' },
    items: [
      createItem('a', { w: 500, h: 300, minW: 40, minH: 40 }, 0, 0),
      createItem('b', { w: 500, h: 300, minW: 40, minH: 40 }, 500, 0),
      createItem('c', { w: 1000, h: 300, minW: 40, minH: 40 }, 0, 300),
    ],
  }
}

function mockRect(element: Element, rect: { x: number; y: number; w: number; h: number }) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: rect.x,
      y: rect.y,
      left: rect.x,
      top: rect.y,
      right: rect.x + rect.w,
      bottom: rect.y + rect.h,
      width: rect.w,
      height: rect.h,
      toJSON: () => ({}),
    }),
  })
}

function pointer(type: string, target: Element, x: number, y: number, extra = {}) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      button: 0,
      pointerType: 'mouse',
      ...extra,
    }),
  )
}

// ---------------------------------------------------------------------------
// Injectable controller and signal helpers (no components)
// ---------------------------------------------------------------------------

describe('GridController (injectable)', () => {
  function makeController<TData = unknown>(
    providers: Parameters<typeof Injector.create>[0]['providers'] = [],
  ) {
    const injector = Injector.create({ providers: [GridController, ...providers] })
    return { injector, controller: injector.get(GridController) as GridController<TData> }
  }

  it('wraps createGridController and mirrors the store in signals', () => {
    const { controller } = makeController()
    controller.setLayout(layoutFixture())
    expect(controller.layout().items.map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(controller.sourceLayout()).toBe(controller.store.getSnapshot().source)
    expect(controller.selectedId()).toBeNull()
    expect(controller.dragging()).toBe(false)
    controller.actions.select('b')
    expect(controller.selectedId()).toBe('b')
    expect(controller.state().selectedId).toBe('b')
  })

  it('select() derives a slice with a custom equality function', () => {
    const { controller } = makeController()
    controller.setLayout(layoutFixture())
    const equal = mock((a: number, b: number) => a === b)
    const count = controller.select((state) => state.layout.items.length, equal)
    expect(count()).toBe(3)
    controller.actions.select('a')
    expect(count()).toBe(3)
    expect(equal).toHaveBeenCalled()
  })

  it('itemView() reflects the preview during a gesture and accepts a signal id', () => {
    const { controller } = makeController()
    controller.setLayout(layoutFixture())
    controller.setSize({ w: 1000, h: 600 })
    const id = signal('a')
    const view = controller.itemView(id)
    expect(view().rect).toEqual({ x: 0, y: 0, w: 500, h: 300 })
    expect(view().isActive).toBe(false)
    controller.gesture.beginMove('a', { x: 10, y: 10 }, 1)
    controller.gesture.updateMove({ x: 60, y: 10 }, { snap: false })
    expect(view().isActive).toBe(true)
    expect(view().activeRect?.x).toBe(50)
    id.set('b')
    expect(view().isActive).toBe(false)
    expect(view().isShifted).toBe(true)
    controller.gesture.cancel()
    expect(view().isShifted).toBe(false)
  })

  it('setOptions merges provideGridla defaults and reports changes through callbacks', () => {
    const { controller } = makeController([
      { provide: GRIDLA_OPTIONS, useValue: { gap: 12, keyboardStep: 16 } },
    ])
    expect(controller.getConfig().gap).toBe(12)
    expect(controller.getConfig().keyboardStep).toBe(16)
    controller.setLayout(layoutFixture())
    const changes: GridChangeDetail[] = []
    controller.setOptions({
      dragThreshold: 2,
      onLayoutChange: (_layout, detail) => changes.push(detail),
    })
    expect(controller.getConfig().gap).toBe(12)
    expect(controller.getConfig().dragThreshold).toBe(2)
    controller.actions.remove('c')
    expect(changes.map((change) => change.reason)).toEqual(['remove'])
    expect(controller.layout().items.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('registers with an injected transfer scope and unregisters on destroy', () => {
    const scope = createTransferScope()
    const register = mock(scope.register)
    scope.register = register
    const { controller } = makeController([{ provide: GRID_TRANSFER_SCOPE, useValue: scope }])
    expect(register).toHaveBeenCalledTimes(1)
    expect(register.mock.calls[0][0].id).toBe(controller.id)
    controller.ngOnDestroy()
    controller.actions.select('a')
    // The store subscription is gone: the signal no longer follows the store.
    expect(controller.selectedId()).toBeNull()
  })

  it('injectGrid* helpers read the nearest controller in an injection context', () => {
    const { injector, controller } = makeController()
    controller.setLayout(layoutFixture())
    runInInjectionContext(injector, () => {
      expect(injectGridController()).toBe(controller)
      expect(injectGridActions()).toBe(controller.actions)
      const ids = injectGridStore((state) => state.layout.items.map((item) => item.id))
      expect(ids()).toEqual(['a', 'b', 'c'])
      const view = injectGridItemView('c')
      expect(view().rect).toEqual({ x: 0, y: 300, w: 1000, h: 300 })
    })
  })

  it('provideGridla and provideGridTransferScope produce usable providers', () => {
    const injector = createEnvironmentInjector(
      [provideGridla({ gap: 4 }), provideGridTransferScope(), GridController],
      createEnvironmentInjector([], Injector.NULL as EnvironmentInjector),
    )
    expect(injector.get(GRIDLA_OPTIONS)).toEqual({ gap: 4 })
    expect(typeof injector.get(GRID_TRANSFER_SCOPE).track).toBe('function')
    expect(injector.get(GridController).getConfig().gap).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// Components (JIT, zoneless, happy-dom)
// ---------------------------------------------------------------------------

type Data = { label: string }

const built = existsSync(FESM)
// The specifier is a variable so the type checker does not look for
// declarations next to the built bundle; its surface equals the source entry.
const adapter = built ? ((await import(FESM)) as typeof AngularAdapter) : null

@Component({
  selector: 'test-host',
  imports: adapter
    ? [
        adapter.GridProviderComponent,
        adapter.GridCanvasComponent,
        adapter.GridItemDirective,
        adapter.GridDragHandleDirective,
        adapter.GridPreviewOutlineComponent,
        adapter.GridTransferScopeComponent,
      ]
    : [],
  template: `
    <gridla-transfer-scope>
      <div
        gridlaProvider
        [(layout)]="layout"
        [dragThreshold]="2"
        [keyboardStep]="10"
        (layoutChangeDetail)="onDetail($event)"
        (commit)="commits.push($event)"
        (selectedIdChange)="selected.set($event)"
      >
        <gridla-canvas (itemClick)="clicks.push($event)">
          @for (item of layout().items; track item.id) {
            <div [gridlaItem]="item.id" [resizeEdges]="['se']" resizeHandleClass="handle">
              {{ item.id }}
            </div>
          }
          <gridla-preview-outline />
        </gridla-canvas>
      </div>
      <div
        gridlaProvider
        #second="gridlaProvider"
        [defaultLayout]="initialSecond"
        [acceptTransfers]="accept()"
      >
        <gridla-canvas class="second">
          @for (item of second.controller.layout().items; track item.id) {
            <div [gridlaItem]="item.id" draggable="false">
              <span gridlaDragHandle>handle</span>
            </div>
          }
        </gridla-canvas>
      </div>
    </gridla-transfer-scope>
  `,
})
class TestHost {
  readonly layout = signal<GridLayout<Data>>(layoutFixture() as GridLayout<Data>)
  readonly initialSecond: GridLayout<Data> = {
    canvas: { width: 400, height: 400, padding, heightMode: 'bounded' },
    items: [createItem('z', { w: 100, h: 100, minW: 20, minH: 20 }, 0, 0)],
  }
  readonly accept = signal(true)
  readonly details: GridLayoutChangeEvent<Data>[] = []
  readonly commits: GridChangeDetail[] = []
  readonly clicks: string[] = []
  readonly selected = signal<string | null>(null)
  onDetail(event: GridLayoutChangeEvent<Data>) {
    this.details.push(event)
  }
}

describe.skipIf(!built)('components (built FESM, JIT, zoneless, happy-dom)', () => {
  let app: ApplicationRef
  let ref: ComponentRef<TestHost>
  let host: HTMLElement
  let canvas: HTMLElement

  // Zoneless: a signal write inside change detection schedules another pass.
  const tick = async () => {
    app.tick()
    await app.whenStable()
    app.tick()
    await app.whenStable()
  }

  beforeEach(async () => {
    app = await createApplication({ providers: [provideZonelessChangeDetection()] })
    host = document.createElement('div')
    document.body.appendChild(host)
    ref = createComponent(TestHost, { environmentInjector: app.injector, hostElement: host })
    app.attachView(ref.hostView)
    app.tick()
    canvas = host.querySelector('[data-gridla-canvas]') as HTMLElement
    mockRect(canvas, { x: 0, y: 0, w: 1000, h: 600 })
    const second = host.querySelector('.second') as HTMLElement
    mockRect(second, { x: 2000, y: 0, w: 400, h: 400 })
    await tick()
  })

  afterEach(() => {
    ref.destroy()
    app.destroy()
    host.remove()
  })

  it('renders the contract attributes and positions items', () => {
    expect(canvas.getAttribute('tabindex')).toBe('0')
    expect(canvas.style.position).toBe('relative')
    const items = Array.from(canvas.querySelectorAll('[data-gridla-item]'))
    expect(items.map((item) => item.getAttribute('data-gridla-item'))).toEqual(['a', 'b', 'c'])
    const b = canvas.querySelector('[data-gridla-item="b"]') as HTMLElement
    expect(b.getAttribute('data-gridla-drag-handle')).toBe('b')
    expect(b.style.transform).toBe('translate(500px, 0px)')
    expect(b.style.width).toBe('500px')
    const handle = b.querySelector('[data-gridla-resize-handle="b"]') as HTMLElement
    expect(handle.getAttribute('data-gridla-edge')).toBe('se')
    expect(handle.className).toBe('handle')
    const preview = canvas.querySelector('[data-gridla-preview]') as HTMLElement
    expect(preview.style.display).toBe('none')
    const z = host.querySelector('[data-gridla-item="z"]') as HTMLElement
    expect(z.hasAttribute('data-gridla-drag-handle')).toBe(false)
    expect(z.querySelector('span')?.getAttribute('data-gridla-drag-handle')).toBe('z')
  })

  it('a drag shows the preview, commits through [(layout)], and reports the strategy', async () => {
    const a = canvas.querySelector('[data-gridla-item="a"]') as HTMLElement
    pointer('pointerdown', a, 10, 10)
    pointer('pointermove', canvas, 30, 10)
    await tick()
    expect(canvas.hasAttribute('data-gridla-active')).toBe(true)
    expect(a.hasAttribute('data-gridla-active')).toBe(true)
    expect(a.hasAttribute('data-gridla-selected')).toBe(true)
    expect(document.documentElement.hasAttribute('data-gridla-dragging')).toBe(true)
    pointer('pointermove', canvas, 210, 10)
    await tick()
    const preview = canvas.querySelector('[data-gridla-preview]') as HTMLElement
    expect(preview.style.display).toBe('block')
    expect(a.style.transform).toBe('translate(200px, 0px)')
    pointer('pointerup', canvas, 210, 10)
    await tick()
    const instance = ref.instance
    expect(instance.layout().items.find((item) => item.id === 'a')?.x).toBe(200)
    expect(instance.details.at(-1)?.change.reason).toBe('move')
    expect(instance.commits.length).toBe(1)
    expect(typeof instance.commits[0].strategy).toBe('string')
    expect(instance.selected()).toBe('a')
    expect(preview.style.display).toBe('none')
    expect(document.documentElement.hasAttribute('data-gridla-dragging')).toBe(false)
  })

  it('a click without movement reports itemClick and the arrow keys nudge the selection', async () => {
    const b = canvas.querySelector('[data-gridla-item="b"]') as HTMLElement
    pointer('pointerdown', b, 600, 100)
    pointer('pointerup', b, 600, 100)
    await tick()
    expect(ref.instance.clicks).toEqual(['b'])
    expect(b.hasAttribute('data-gridla-selected')).toBe(true)
    // The fixture fills the canvas: make room first (Alt resizes, Shift x4), then nudge.
    const press = (key: string, extra = {}) =>
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...extra }))
    press('ArrowUp', { altKey: true, shiftKey: true })
    await tick()
    expect(ref.instance.layout().items.find((item) => item.id === 'b')?.h).toBe(260)
    press('ArrowDown')
    await tick()
    expect(ref.instance.layout().items.find((item) => item.id === 'b')?.y).toBe(10)
    expect(b.style.transform).toBe('translate(500px, 10px)')
    expect(b.style.height).toBe('260px')
  })

  it('a parent update flows into the canvas (controlled round trip)', async () => {
    const next = layoutFixture() as GridLayout<Data>
    next.items[2] = { ...next.items[2], y: 290 }
    ref.instance.layout.set(next)
    await tick()
    const c = canvas.querySelector('[data-gridla-item="c"]') as HTMLElement
    expect(c.style.transform).toBe('translate(0px, 290px)')
    // No change was reported: the provider only follows the input.
    expect(ref.instance.details.length).toBe(0)
  })

  it('transfers an item into the second provider through the scope', async () => {
    const a = canvas.querySelector('[data-gridla-item="a"]') as HTMLElement
    pointer('pointerdown', a, 10, 10)
    pointer('pointermove', canvas, 30, 10)
    pointer('pointermove', canvas, 2100, 100)
    await tick()
    expect(a.hasAttribute('data-gridla-transferring')).toBe(true)
    const second = host.querySelector('.second') as HTMLElement
    pointer('pointerup', canvas, 2100, 100)
    await tick()
    expect(ref.instance.layout().items.map((item) => item.id)).toEqual(['b', 'c'])
    expect(second.querySelector('[data-gridla-item="a"]')).not.toBeNull()
    expect(ref.instance.details.at(-1)?.change.reason).toBe('transfer')
  })
})
