import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { pinia } from './pinia'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('./views/HomeView.vue'), meta: { requiresAuth: true } },
    { path: '/namespaces', name: 'namespaces', component: () => import('./views/HomeView.vue'), meta: { requiresAuth: true } },
    {
      path: '/namespaces/:namespace',
      name: 'namespace',
      component: () => import('./views/NamespaceView.vue'),
      props: true,
      meta: { requiresAuth: true },
    },
    {
      path: '/secrets/:namespace/:name',
      name: 'secret-detail',
      component: () => import('./views/SecretDetailView.vue'),
      props: true,
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true
  const auth = useAuthStore(pinia)
  if (auth.isAuthenticated) return true
  try {
    await auth.loadSession()
    return true
  } catch {
    window.location.assign('/api/v1/auth/login')
    return false
  }
})
