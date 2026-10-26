import { createApp } from 'vue'
import { pinia } from './pinia'
import './style.css'
import App from './App.vue'
import { router } from './router'
import { reportWebVitals } from './utils/telemetry'
import { consumeReturnPath } from './utils/returnPath'

const app = createApp(App)
app.use(pinia)
app.use(router)
app.mount('#app')

// After the OIDC callback the server lands on the app root, so send the operator back to the page they were on when the session expired.
router.isReady().then(() => {
  const returnPath = consumeReturnPath()
  if (returnPath && returnPath !== router.currentRoute.value.fullPath) {
    void router.replace(returnPath)
  }
})

// Reports to the API telemetry endpoint only when VITE_TELEMETRY_ENDPOINT is set, so local dev and tests make no network requests.
reportWebVitals()
