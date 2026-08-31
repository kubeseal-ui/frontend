// Vue 3 application bootstrap for kubeseal-ui.
//
// This is the minimal MVP entry: it mounts a single App component, registers
// Pinia for state, vue-router for the eventual namespace/secret routes, and
// Naive UI for the component library. Per internal-docs/engineering/frontend/
// application-design.md, real views, stores, and API adapters live under
// src/{views,stores,api} and are filled in by subsequent phases.
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import naive from 'naive-ui'

import './style.css'
import App from './App.vue'
import { router } from './router'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(naive)
app.mount('#app')
