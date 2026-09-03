import '@gridla/demo-kit/tokens.css'
import '@gridla/demo-kit/demo.css'
import './app.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
