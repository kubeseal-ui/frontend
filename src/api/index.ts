import { useAuthStore } from '@/stores/auth'

export interface ApiErrorShape {
  error?: { code?: string; message?: string; request_id?: string }
}

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly requestId?: string

  constructor(status: number, body?: ApiErrorShape) {
    super(body?.error?.message || `API request failed (${status})`)
    this.name = 'ApiError'
    this.status = status
    this.code = body?.error?.code
    this.requestId = body?.error?.request_id
  }
}

interface ApiResponse<T> { data: T }

function readCookie(name: string): string | null {
  const prefix = `${encodeURIComponent(name)}=`
  const value = document.cookie.split('; ').find((cookie) => cookie.startsWith(prefix))
  return value ? decodeURIComponent(value.slice(prefix.length)) : null
}

class ApiClient {
  private csrfToken: string | null = null

  async request<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const method = (options.method || 'GET').toUpperCase()
    const headers = new Headers(options.headers)
    if (method !== 'GET' && method !== 'HEAD') {
      const csrf = this.csrfToken || readCookie('kubeseal_csrf')
      if (csrf) headers.set('X-CSRF-Token', csrf)
      headers.set('Accept', 'application/json')
    }

    const response = await fetch(path, { ...options, headers, credentials: 'include' })
    let body: unknown
    try { body = await response.json() } catch { body = undefined }

    if (response.status === 401) useAuthStore().clearSession()
    if (!response.ok) throw new ApiError(response.status, body as ApiErrorShape | undefined)
    return { data: body as T }
  }

  async get<T>(path: string) { return this.request<T>(path) }
  async post<T>(path: string, body: unknown, headers?: HeadersInit) {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...headers } })
  }
  async patch<T>(path: string, body: unknown, headers?: HeadersInit) {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...headers } })
  }

  setCsrfToken(token: string) { this.csrfToken = token }

  async bootstrapCsrf() {
    const response = await this.get<{ csrf_token: string }>('/api/v1/auth/csrf')
    this.setCsrfToken(response.data.csrf_token)
    return response.data.csrf_token
  }
}

export const api = new ApiClient()
