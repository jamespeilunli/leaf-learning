import axios from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from './api'
import { getApiBaseUrl } from './apiConfig'
import { OPENAI_API_KEY_HEADER, OPENAI_API_KEY_STORAGE_KEY } from './openAiApiKey'
import { makeSession } from '../test/fixtures'

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  patch: vi.fn(),
}))

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      post: mocks.post,
      get: mocks.get,
      delete: mocks.del,
      patch: mocks.patch,
    })),
  },
}))

describe('api client', () => {
  beforeEach(() => {
    mocks.post.mockClear()
    mocks.get.mockClear()
    mocks.del.mockClear()
    mocks.patch.mockClear()
  })

  it('maps session endpoints to the backend contract', async () => {
    expect(axios.create).toHaveBeenCalledWith({ baseURL: getApiBaseUrl() })
    const session = makeSession()
    mocks.post.mockResolvedValueOnce({ data: { session_id: 'session-1', session } })

    await expect(api.createSession('ML')).resolves.toEqual({ session_id: 'session-1', session })

    expect(mocks.post).toHaveBeenCalledWith('/session', { topic: 'ML' })
  })

  it('adds the saved OpenAI API key header to requests', async () => {
    const session = makeSession()
    localStorage.setItem(OPENAI_API_KEY_STORAGE_KEY, 'sk-user-key')
    mocks.post.mockResolvedValueOnce({ data: { session_id: 'session-1', session } })

    await api.createSession('ML')

    expect(mocks.post).toHaveBeenCalledWith(
      '/session',
      { topic: 'ML' },
      { headers: { [OPENAI_API_KEY_HEADER]: 'sk-user-key' } },
    )
  })

  it('maps graph mutation endpoints to the backend contract', async () => {
    const session = makeSession()
    mocks.post.mockResolvedValue({ data: session })

    await api.generatePhase1Children(session, 'node-1')
    await api.explainNode('session-1', 'node-1', session)
    await api.suggestPrerequisite('session-1', 'node-1', 'add linear algebra', session)
    await api.prefetchPhase2('session-1', session, ['node-1'])

    expect(mocks.post).toHaveBeenCalledWith('/phase1/children', { session, node_id: 'node-1' })
    expect(mocks.post).toHaveBeenCalledWith('/session/session-1/node/node-1/explain', { session })
    expect(mocks.post).toHaveBeenCalledWith('/session/session-1/node/node-1/suggest-prerequisite', {
      message: 'add linear algebra',
      session,
    })
    expect(mocks.post).toHaveBeenCalledWith('/session/session-1/phase2/prefetch', {
      session,
      start_node_ids: ['node-1'],
    })
  })
})
