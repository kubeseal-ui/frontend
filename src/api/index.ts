// API client: thin wrapper around fetch with session/CSRF handling.
import { useAuthStore } from '@/stores/auth'

interface ApiResponse<T> {
  data: T
}

class ApiClient {
  private csrfToken: string | null = null

  async request<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const response = await fetch(path, {
      ...options,
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    return response.json()
  }

  async post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        ...this.getCsrfHeaders(),
      },
    })
  }

  async patch<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        ...this.getCsrfHeaders(),
      },
    })
  }

  async get<T>(path: string): Promise<ApiResponse<T>> {
    return this.request(path, {
      method: 'GET',
    })
  }

  private getCsrfHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}
    if (this.csrfToken) {
      headers['X-CSRF-Token'] = this.csrfToken
    }
    return headers
  }

  setCsrfToken(token: string) {
    this.csrfToken = token
  }
}

export const api = new ApiClient()