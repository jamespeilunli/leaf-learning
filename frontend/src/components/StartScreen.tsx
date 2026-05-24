import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Leaf } from 'lucide-react'

import { listSessions } from '../lib/api'
import { useSessionStore } from '../store/useSessionStore'
import type { Phase } from '../types'
import { LaunchGraphBackground } from './LaunchGraphBackground'

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
    <main className="relative min-h-screen overflow-hidden bg-[var(--bg)] text-[var(--ink)]">
      <LaunchGraphBackground />

      <div className="relative flex min-h-screen flex-col px-5 pb-8 pt-5 sm:px-8 sm:pb-10 sm:pt-7">
        <header className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/50 bg-white/60 shadow-[0_10px_30px_rgba(33,55,31,0.10)] backdrop-blur">
            <Leaf className="h-6 w-6 text-[var(--leaf)]" strokeWidth={2.1} />
          </div>
          <div>
            <div className="font-sans-display text-lg tracking-[0.18em] text-[var(--leaf-deep)] uppercase">
              Leaf Learning
            </div>
            <div className="text-sm text-[var(--muted)]">Map the ideas that unlock the topic you actually want.</div>
          </div>
        </header>

        <section className="flex flex-1 items-start justify-center px-2 pb-6 pt-8 sm:pb-8 sm:pt-10">
          <div className="max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--leaf-deep)]/80">
              Adaptive learning graph
            </p>
            <h1 className="mt-4 font-serif-display text-4xl leading-[0.95] sm:text-6xl">
              Turn curiosity into a study path that keeps unfolding.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[var(--muted)] sm:text-base">
              Start with a topic, narrow it into the version you care about, and let the map grow into the exact prerequisites, concepts, and resources behind it.
            </p>
          </div>
        </section>

        <div className="relative mx-auto w-full max-w-5xl">
          <form
            className="mx-auto flex max-w-3xl flex-col gap-4 rounded-[30px] border border-white/55 bg-white/70 p-4 shadow-[0_24px_70px_rgba(31,52,28,0.14)] backdrop-blur-xl sm:rounded-[34px] sm:p-5"
            onSubmit={handleSubmit}
          >
            <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <label className="text-xl font-semibold text-[var(--leaf-deep)]" htmlFor="topic">
                  Ready to learn?
                </label>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Examples: diffusion models, calculus for robotics, worldbuilding for fiction
                </p>
              </div>
              <button
                className="inline-flex self-start rounded-full bg-[var(--leaf-deep)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--leaf)] disabled:opacity-60 sm:self-auto"
                disabled={isLoading}
                type="submit"
              >
                {isLoading ? `Exploring ${topic.trim() || 'your topic'}...` : 'Start exploring'}
              </button>
            </div>

            <textarea
              id="topic"
              className="min-h-28 w-full resize-none rounded-[24px] border border-white/80 bg-white/85 px-5 py-4 text-base leading-7 outline-none transition placeholder:text-[var(--muted)]/85 focus:border-[var(--leaf)] focus:bg-white"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Name the topic, angle, or outcome you want to understand."
            />

            {error ? <p className="px-1 text-sm text-[var(--danger)]">{error}</p> : null}
          </form>

          {sessions.length ? (
            <div className="mx-auto mt-5 max-w-3xl rounded-[28px] border border-white/45 bg-white/55 p-4 shadow-[0_18px_50px_rgba(31,52,28,0.10)] backdrop-blur-xl sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted-strong)]">
                Continue a previous session
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    className="flex w-full items-center justify-between rounded-[22px] border border-white/65 bg-white/75 px-4 py-4 text-left transition hover:-translate-y-0.5 hover:border-[var(--leaf)]/45 hover:bg-white"
                    type="button"
                    onClick={() => void loadSession(session.id)}
                  >
                    <div>
                      <div className="font-semibold">{session.root_topic}</div>
                      <div className="mt-1 text-sm text-[var(--muted)]">
                        {new Date(session.created_at).toLocaleString()}
                      </div>
                    </div>
                    <span className="rounded-full bg-[var(--leaf-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--leaf-deep)]">
                      Phase {session.phase}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  )
}
