import type { Phase, Session } from '../types'

export const LOCAL_SESSIONS_STORAGE_KEY = 'roadmap_sessions'

export type SessionSummary = {
  id: string
  root_topic: string
  created_at: string
  phase: Phase
}

function readSessionsMap(): Record<string, Session> {
  const raw = localStorage.getItem(LOCAL_SESSIONS_STORAGE_KEY)
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, Session>
  } catch {
    return {}
  }
}

function writeSessionsMap(sessions: Record<string, Session>) {
  localStorage.setItem(LOCAL_SESSIONS_STORAGE_KEY, JSON.stringify(sessions))
}

export function saveLocalSession(session: Session) {
  const sessions = readSessionsMap()
  sessions[session.id] = session
  writeSessionsMap(sessions)
}

export function loadLocalSession(id: string): Session | null {
  return readSessionsMap()[id] ?? null
}

export function listLocalSessionSummaries(): SessionSummary[] {
  return Object.values(readSessionsMap())
    .map((session) => ({
      id: session.id,
      root_topic: session.root_topic,
      created_at: session.created_at,
      phase: session.phase,
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}
