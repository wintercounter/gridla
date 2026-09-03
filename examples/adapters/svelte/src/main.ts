import '@gridla/demo-kit/tokens.css'
import '@gridla/demo-kit/demo.css'
import './style.css'

import { mount } from 'svelte'

import App from './App.svelte'

mount(App, { target: document.getElementById('root') as HTMLElement })
