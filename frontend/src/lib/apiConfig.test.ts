import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApiUrl, getApiBaseUrl } from './apiConfig'

describe('apiConfig', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_BACKEND_URL', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses the local Vite proxy by default', () => {
    expect(getApiBaseUrl('')).toBe('/api')
    expect(getApiBaseUrl()).toBe('/api')
    expect(buildApiUrl('/session', '')).toBe('/api/session')
    expect(buildApiUrl('/api/session', '')).toBe('/api/session')
  })

  it('builds backend API URLs from VITE_BACKEND_URL', () => {
    expect(getApiBaseUrl('https://backend.example.com')).toBe('https://backend.example.com/api')
    expect(getApiBaseUrl('https://backend.example.com/')).toBe('https://backend.example.com/api')
    expect(getApiBaseUrl('https://backend.example.com/api')).toBe('https://backend.example.com/api')
    expect(buildApiUrl('/session/1', 'https://backend.example.com/')).toBe(
      'https://backend.example.com/api/session/1',
    )
    expect(buildApiUrl('/api/session/1', 'https://backend.example.com/')).toBe(
      'https://backend.example.com/api/session/1',
    )
  })

  it('leaves absolute URLs unchanged', () => {
    expect(buildApiUrl('https://other.example.com/events', 'https://backend.example.com')).toBe(
      'https://other.example.com/events',
    )
  })
})
