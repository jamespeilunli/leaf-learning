export async function clearBrowserData(): Promise<void> {
  localStorage.clear()
  sessionStorage.clear()

  if ('caches' in globalThis) {
    const cacheKeys = await globalThis.caches.keys()
    await Promise.all(cacheKeys.map((key) => globalThis.caches.delete(key)))
  }

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
  }

  clearCookies()
}

function clearCookies() {
  if (typeof document === 'undefined' || !document.cookie) return

  const domains = getCookieDomains(window.location.hostname)
  const paths = ['/', window.location.pathname].filter(Boolean)

  for (const cookie of document.cookie.split(';')) {
    const [rawName] = cookie.split('=')
    const name = rawName?.trim()
    if (!name) continue

    for (const domain of domains) {
      for (const path of paths) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}; domain=${domain}`
      }
    }

    for (const path of paths) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}`
    }
  }
}

function getCookieDomains(hostname: string): string[] {
  if (!hostname || hostname === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return []
  }

  const parts = hostname.split('.')
  return parts.map((_, index) => `.${parts.slice(index).join('.')}`)
}
