import axios from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from './api'
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
    expect(axios.create).toHaveBeenCalledWith({ baseURL: '/api' })
    const session = makeSession()
    mocks.post.mockResolvedValueOnce({ data: { session_id: 'session-1', session } })
    mocks.get.mockResolvedValueOnce({ data: session })
    mocks.get.mockResolvedValueOnce({ data: [{ id: 'session-1', root_topic: 'ML', created_at: 'now', phase: '1' }] })
    mocks.del.mockResolvedValueOnce({ data: { deleted_count: 1 } })

    await expect(api.createSession('ML')).resolves.toEqual({ session_id: 'session-1', session })
    await expect(api.getSession('session-1')).resolves.toBe(session)
    await expect(api.listSessions()).resolves.toHaveLength(1)
    await expect(api.clearSessions()).resolves.toEqual({ deleted_count: 1 })

    expect(mocks.post).toHaveBeenCalledWith('/session', { topic: 'ML' })
    expect(mocks.get).toHaveBeenCalledWith('/session/session-1')
    expect(mocks.get).toHaveBeenCalledWith('/sessions')
    expect(mocks.del).toHaveBeenCalledWith('/sessions')
  })

  it('maps graph mutation endpoints to the backend contract', async () => {
    const session = makeSession()
    mocks.post.mockResolvedValue({ data: session })
    mocks.patch.mockResolvedValue({ data: session })
    mocks.del.mockResolvedValue({ data: { removed_node_ids: ['node-1'] } })

    await api.selectTopic('session-1', 'node-1')
    await api.expandPhase1Topic('session-1', 'node-1')
    await api.back('session-1')
    await api.deepDive('session-1', 'node-1')
    await api.explainNode('session-1', 'node-1')
    await api.suggestPrerequisite('session-1', 'node-1', 'add linear algebra')
    await api.updateNodeState('session-1', 'node-1', 'learned')
    await expect(api.deleteNode('session-1', 'node-1')).resolves.toEqual({ removed_node_ids: ['node-1'] })

    expect(mocks.post).toHaveBeenCalledWith('/session/session-1/select-topic', { node_id: 'node-1' })
    expect(mocks.post).toHaveBeenCalledWith('/session/session-1/phase1-expand', { node_id: 'node-1' })
    expect(mocks.post).toHaveBeenCalledWith('/session/session-1/back')
    expect(mocks.post).toHaveBeenCalledWith('/session/session-1/deep-dive', { node_id: 'node-1' })
    expect(mocks.post).toHaveBeenCalledWith('/session/session-1/node/node-1/explain')
    expect(mocks.post).toHaveBeenCalledWith('/session/session-1/node/node-1/suggest-prerequisite', {
      message: 'add linear algebra',
    })
    expect(mocks.patch).toHaveBeenCalledWith('/session/session-1/node/node-1/status', { node_state: 'learned' })
    expect(mocks.del).toHaveBeenCalledWith('/session/session-1/node/node-1')
  })
})
