export const OPENAI_API_KEY_STORAGE_KEY = 'openai_api_key'
export const OPENAI_API_KEY_HEADER = 'X-OpenAI-API-Key'
const API_KEY_PLACEHOLDER = 'sk-your-key-here'

export function normalizeOpenAiApiKey(value: string | null | undefined): string {
  const key = (value ?? '').trim()
  if (!key || key === API_KEY_PLACEHOLDER) {
    return ''
  }
  return key
}

export function getOpenAiApiKey(): string {
  return normalizeOpenAiApiKey(localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY))
}

export function saveOpenAiApiKey(value: string): string {
  const key = normalizeOpenAiApiKey(value)
  if (key) {
    localStorage.setItem(OPENAI_API_KEY_STORAGE_KEY, key)
  } else {
    localStorage.removeItem(OPENAI_API_KEY_STORAGE_KEY)
  }
  return key
}

export function clearOpenAiApiKey(): void {
  localStorage.removeItem(OPENAI_API_KEY_STORAGE_KEY)
}

export function getOpenAiApiKeyHeaders(): Record<string, string> {
  const key = getOpenAiApiKey()
  return key ? { [OPENAI_API_KEY_HEADER]: key } : {}
}
