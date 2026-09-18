import { createApp } from 'vue'
import { pinia } from './pinia'
import './style.css'
import App from './App.vue'
import { router } from './router'
import { reportWebVitals } from './utils/telemetry'

// Naive UI components are imported per component (not registered globally) so the
// production bundle only ships the components each view actually uses.
const app = createApp(App)
app.use(pinia)
app.use(router)
app.mount('#app')

// Web vitals (CLS, INP, FCP, LCP, TTFB) report to the API telemetry
// endpoint when VITE_TELEMETRY_ENDPOINT is set; unset keeps every call a
// no-op so local dev and tests make no network requests.
reportWebVitals()
