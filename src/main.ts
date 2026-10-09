import { createApp } from 'vue'
import { pinia } from './pinia'
import './style.css'
import App from './App.vue'
import { router } from './router'
import { reportWebVitals } from './utils/telemetry'

const app = createApp(App)
app.use(pinia)
app.use(router)
app.mount('#app')

// Reports to the API telemetry endpoint only when VITE_TELEMETRY_ENDPOINT is set, so
// local dev and tests make no network requests.
reportWebVitals()
