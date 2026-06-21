import { describe, expect, it } from 'vitest'

import {
  OPENAI_API_KEY_HEADER,
  OPENAI_API_KEY_STORAGE_KEY,
  clearOpenAiApiKey,
  getOpenAiApiKey,
  getOpenAiApiKeyHeaders,
  normalizeOpenAiApiKey,
  saveOpenAiApiKey,
} from './openAiApiKey'

describe('OpenAI API key storage', () => {
  it('normalizes keys and rejects empty or placeholder values', () => {
    expect(normalizeOpenAiApiKey('')).toBe('')
    expect(normalizeOpenAiApiKey(' sk-your-key-here ')).toBe('')
    expect(normalizeOpenAiApiKey(' sk-user-key ')).toBe('sk-user-key')
  })

  it('saves, reads, clears, and builds request headers', () => {
    expect(saveOpenAiApiKey(' sk-user-key ')).toBe('sk-user-key')
    expect(localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY)).toBe('sk-user-key')
    expect(getOpenAiApiKey()).toBe('sk-user-key')
    expect(getOpenAiApiKeyHeaders()).toEqual({ [OPENAI_API_KEY_HEADER]: 'sk-user-key' })

    clearOpenAiApiKey()

    expect(getOpenAiApiKey()).toBe('')
    expect(getOpenAiApiKeyHeaders()).toEqual({})
  })
})
