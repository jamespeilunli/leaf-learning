import { beforeEach, describe, expect, it } from 'vitest'

import {
  listLocalSessionSummaries,
  loadLocalSession,
  LOCAL_SESSIONS_STORAGE_KEY,
  saveLocalSession,
} from './sessionPersistence'
import { makeSession } from '../test/fixtures'

describe('session persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('saves, loads, and lists browser-local sessions newest first', () => {
    const older = makeSession({
      id: 'older',
      root_topic: 'Older Topic',
      created_at: '2026-01-01T00:00:00Z',
    })
    const newer = makeSession({
      id: 'newer',
      root_topic: 'Newer Topic',
      created_at: '2026-01-02T00:00:00Z',
    })

    saveLocalSession(older)
    saveLocalSession(newer)

    expect(loadLocalSession('older')).toEqual(older)
    expect(listLocalSessionSummaries().map((session) => session.id)).toEqual(['newer', 'older'])
  })

  it('treats malformed localStorage data as empty', () => {
    localStorage.setItem(LOCAL_SESSIONS_STORAGE_KEY, '{bad json')

    expect(loadLocalSession('missing')).toBeNull()
    expect(listLocalSessionSummaries()).toEqual([])
  })
})
