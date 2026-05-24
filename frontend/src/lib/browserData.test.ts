import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearBrowserData } from './browserData'

describe('clearBrowserData', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('clears storage, cache storage, service workers, and cookies', async () => {
    localStorage.setItem('session', 'abc')
    sessionStorage.setItem('draft', '123')

    const deleteCache = vi.fn().mockResolvedValue(true)
    const unregister = vi.fn().mockResolvedValue(true)
    const getRegistrations = vi.fn().mockResolvedValue([{ unregister }])

    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: {
        delete: deleteCache,
        keys: vi.fn().mockResolvedValue(['ui-cache', 'api-cache']),
      },
    })

    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations },
    })

    let cookieValue = 'auth=1; theme=dark'
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => cookieValue,
      set: (value: string) => {
        cookieValue = value
      },
    })

    await clearBrowserData()

    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    expect(deleteCache).toHaveBeenCalledTimes(2)
    expect(deleteCache).toHaveBeenCalledWith('ui-cache')
    expect(deleteCache).toHaveBeenCalledWith('api-cache')
    expect(getRegistrations).toHaveBeenCalledTimes(1)
    expect(unregister).toHaveBeenCalledTimes(1)
    expect(cookieValue).toContain('expires=Thu, 01 Jan 1970 00:00:00 GMT')
  })
})
