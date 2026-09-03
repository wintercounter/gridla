import '@gridla/demo-kit/tokens.css'
import '@gridla/demo-kit/demo.css'
import './style.css'

// JIT: the compiler must be loaded before any component is bootstrapped.
import '@angular/compiler'
import { provideZonelessChangeDetection } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { provideGridla } from 'gridla/angular'

import { AppComponent } from './app.component'

bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection(), provideGridla({ snapDistance: 16 })],
}).catch((error: unknown) => console.error(error))
