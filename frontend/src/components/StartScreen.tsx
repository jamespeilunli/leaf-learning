import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { listSessions } from '../lib/api'
import { useSessionStore } from '../store/useSessionStore'
import type { Phase } from '../types'

type SessionRow = { id: string; root_topic: string; created_at: string; phase: Phase }

export function StartScreen() {
  const initSession = useSessionStore((state) => state.initSession)
  const loadSession = useSessionStore((state) => state.loadSession)
  const isLoading = useSessionStore((state) => state.isLoading)
  const error = useSessionStore((state) => state.error)
  const [topic, setTopic] = useState('')
  const [sessions, setSessions] = useState<SessionRow[]>([])

  useEffect(() => {
    let active = true
    void listSessions()
      .then((data) => {
        if (active) setSessions(data)
      })
      .catch(() => {
        if (active) setSessions([])
      })

    return () => {
      active = false
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = topic.trim()
    if (!trimmed || isLoading) return
    await initSession(trimmed)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-10 text-[var(--ink)]">
      <div className="w-full max-w-5xl overflow-hidden rounded-[36px] border border-[var(--line)] bg-[var(--paper)] shadow-[0_40px_100px_rgba(15,23,42,0.14)]">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
          <section className="bg-[linear-gradient(160deg,rgba(14,165,233,0.12),rgba(245,158,11,0.14),rgba(255,255,255,0.85))] p-8 sm:p-10">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
              Learning Roadmap
            </p>
            <h1 className="mt-4 max-w-xl font-serif-display text-5xl leading-[0.95] sm:text-6xl">
              Turn a vague topic into a prerequisite map you can actually follow.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-[var(--muted)]">
              Start broad, drill down into a concrete goal, then expand the exact concepts and resources that goal depends on.
            </p>
          </section>

          <section className="p-8 sm:p-10">
            <form className="rounded-[28px] border border-[var(--line)] bg-white p-6" onSubmit={handleSubmit}>
              <label className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-strong)]" htmlFor="topic">
                What do you want to learn?
              </label>
              <textarea
                id="topic"
                className="mt-4 min-h-36 w-full resize-none rounded-[20px] border border-[var(--line)] bg-[var(--panel)] p-4 text-base leading-7 outline-none transition focus:border-[var(--accent)]"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="Examples: diffusion models, Rust for systems programming, linear algebra for machine learning"
              />

              <button
                className="mt-5 inline-flex rounded-full bg-[var(--ink)] px-5 py-3 text-sm font-semibold text-[var(--paper)] transition hover:bg-[var(--accent)] disabled:opacity-60"
                disabled={isLoading}
                type="submit"
              >
                {isLoading ? `Exploring ${topic.trim() || 'your topic'}...` : 'Start exploring'}
              </button>

              {error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}
            </form>

            {sessions.length ? (
              <div className="mt-6">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-strong)]">
                  Continue a previous session
                </p>
                <div className="mt-3 space-y-3">
                  {sessions.map((session) => (
                    <button
                      key={session.id}
                      className="flex w-full items-center justify-between rounded-[18px] border border-[var(--line)] bg-white px-4 py-4 text-left transition hover:border-[var(--accent)]"
                      type="button"
                      onClick={() => void loadSession(session.id)}
                    >
                      <div>
                        <div className="font-semibold">{session.root_topic}</div>
                        <div className="mt-1 text-sm text-[var(--muted)]">
                          {new Date(session.created_at).toLocaleString()}
                        </div>
                      </div>
                      <span className="rounded-full bg-[var(--panel)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-strong)]">
                        Phase {session.phase}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  )
}
