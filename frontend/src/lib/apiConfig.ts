const DEFAULT_API_BASE_URL = '/api'
const API_PREFIX = '/api'

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '')
}

function withLeadingSlash(value: string): string {
  return value.startsWith('/') ? value : `/${value}`
}

function apiPathFromEndpoint(endpoint: string): string {
  const path = withLeadingSlash(endpoint)
  if (path === API_PREFIX) {
    return ''
  }
  if (path.startsWith(`${API_PREFIX}/`)) {
    return path.slice(API_PREFIX.length)
  }
  return path
}

export function getApiBaseUrl(
  backendUrl = import.meta.env.VITE_BACKEND_URL,
): string {
  const configuredBackendUrl = backendUrl?.trim()
  if (!configuredBackendUrl) {
    return DEFAULT_API_BASE_URL
  }

  const normalizedBackendUrl = trimTrailingSlashes(configuredBackendUrl)
  if (normalizedBackendUrl.endsWith(API_PREFIX)) {
    return normalizedBackendUrl
  }

  return `${normalizedBackendUrl}${API_PREFIX}`
}

export function buildApiUrl(
  endpoint: string,
  backendUrl = import.meta.env.VITE_BACKEND_URL,
): string {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint
  }

  return `${getApiBaseUrl(backendUrl)}${apiPathFromEndpoint(endpoint)}`
}
