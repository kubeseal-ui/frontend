// vue-router setup for kubeseal-ui.
//
// MVP ships with a single placeholder home route. Subsequent phases add the
// namespace browser, secret detail, reveal/patch, and GitOps delivery routes
// described in internal-docs/engineering/frontend/application-design.md.
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
  ],
})
