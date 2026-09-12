import { createApp } from 'vue'
import { pinia } from './pinia'
import './style.css'
import App from './App.vue'
import { router } from './router'

// Naive UI components are imported per component (not registered globally) so the
// production bundle only ships the components each view actually uses.
const app = createApp(App)
app.use(pinia)
app.use(router)
app.mount('#app')
