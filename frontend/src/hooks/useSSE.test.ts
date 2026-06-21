import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { streamSSE } from './useSSE'
import { OPENAI_API_KEY_HEADER, OPENAI_API_KEY_STORAGE_KEY } from '../lib/openAiApiKey'

async function collect<T>(iterable: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = []
  for await (const item of iterable) {
    items.push(item)
  }
  return items
}

function streamFromText(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    },
  })
}

describe('streamSSE', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_BACKEND_URL', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('posts JSON and parses event/data pairs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: streamFromText('event: token\ndata: {"text":"hello"}\n\nevent: stream_done\ndata: {}\n\n'),
    })
    vi.stubGlobal('fetch', fetchMock)

    const events = await collect(streamSSE('/api/chat', { message: 'hi' }))

    expect(fetchMock).toHaveBeenCalledWith('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    })
    expect(events).toEqual([
      { event: 'token', data: { text: 'hello' } },
      { event: 'stream_done', data: {} },
    ])
  })

  it('posts to the configured backend URL when set', async () => {
    vi.stubEnv('VITE_BACKEND_URL', 'https://backend.example.com/')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: streamFromText('event: stream_done\ndata: {}\n\n'),
    })
    vi.stubGlobal('fetch', fetchMock)

    await collect(streamSSE('/api/chat', { message: 'hi' }))

    expect(fetchMock).toHaveBeenCalledWith('https://backend.example.com/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    })
  })

  it('adds the saved OpenAI API key header', async () => {
    localStorage.setItem(OPENAI_API_KEY_STORAGE_KEY, 'sk-user-key')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: streamFromText('event: stream_done\ndata: {}\n\n'),
    })
    vi.stubGlobal('fetch', fetchMock)

    await collect(streamSSE('/api/chat', { message: 'hi' }))

    expect(fetchMock).toHaveBeenCalledWith('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [OPENAI_API_KEY_HEADER]: 'sk-user-key' },
      body: JSON.stringify({ message: 'hi' }),
    })
  })

  it('throws on non-ok responses and unavailable bodies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    await expect(collect(streamSSE('/api/fail', {}))).rejects.toThrow('HTTP 500')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: null }))
    await expect(collect(streamSSE('/api/fail', {}))).rejects.toThrow('Streaming body is unavailable.')
  })
})
