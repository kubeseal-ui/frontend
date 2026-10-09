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
      component: () => import('./views/SecretDetailView.vue'),
      props: true,
      meta: { requiresAuth: true },
    },
  ],
})

/**
 * The session gate.
 *
 * Only a 401 means the caller has no session: that is the status the auth
 * middleware answers an unauthenticated request with, and it is the one case
 * where sending the browser to the identity provider is the right answer.
 *
 * Any other failure — a server that is down, a gateway that timed out — would
 * be told to the operator as an ended session if it took the same branch, and
 * they would sign in again to find the same broken page. Letting the route
 * through instead is what puts the real failure in front of them: every view
 * loads its own data and reports that failure in its own error state.
 */
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
