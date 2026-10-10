import { createRouter, createWebHistory } from 'vue-router'
import { ApiError } from './api'
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
      path: '/namespaces/:namespace/new',
      name: 'new-secret',
      component: () => import('./views/NewSecretView.vue'),
      props: true,
      meta: { requiresAuth: true },
    },
    {
      path: '/secrets/:namespace/:name',
      name: 'secret-detail',
      component: () => import('./views/SecretSurface.vue'),
      props: true,
      meta: { requiresAuth: true },
    },
  ],
})

// Only 401 means "no session"; anything else is let through so the view reports the
// real failure instead of sending the operator to sign in again on a broken page.
router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true
  const auth = useAuthStore(pinia)
  if (auth.isAuthenticated) return true
  try {
    await auth.loadSession()
    return true
  } catch (error) {
    if (error instanceof ApiError && error.status !== 401) return true
    window.location.assign('/api/v1/auth/login')
    return false
  }
})
