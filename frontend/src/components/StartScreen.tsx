import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Clock3, Leaf, Loader2, RotateCcw } from 'lucide-react'

import { listSessions } from '../lib/api'
import { useSessionStore } from '../store/useSessionStore'
import type { Phase } from '../types'
import { LaunchGraphBackground } from './LaunchGraphBackground'
import { Button, Eyebrow, Panel, StatusNotice, TextArea } from './ui'

type SessionRow = { id: string; root_topic: string; created_at: string; phase: Phase }

export function StartScreen() {
  const initSession = useSessionStore((state) => state.initSession)
  const loadSession = useSessionStore((state) => state.loadSession)
  const restartFlow = useSessionStore((state) => state.restartFlow)
  const isLoading = useSessionStore((state) => state.isLoading)
  const error = useSessionStore((state) => state.error)
  const [topic, setTopic] = useState('')
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [isLoadingSessions, setIsLoadingSessions] = useState(true)
  const [sessionListError, setSessionListError] = useState(false)

  useEffect(() => {
    let active = true
    void listSessions()
      .then((data) => {
        if (active) setSessions(data)
      })
      .catch(() => {
        if (active) {
          setSessions([])
          setSessionListError(true)
        }
      })
      .finally(() => {
        if (active) setIsLoadingSessions(false)
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

      <div className="relative flex min-h-screen flex-col px-4 pb-8 pt-5 sm:px-8 sm:pb-10 sm:pt-7">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-sm)] border border-white/60 bg-white/70 shadow-[0_10px_30px_rgba(33,55,31,0.10)] backdrop-blur">
              <Leaf className="h-6 w-6 text-[var(--leaf)]" strokeWidth={2.1} />
            </div>
            <div>
              <div className="font-sans-display text-lg uppercase tracking-[0.18em] text-[var(--leaf-deep)]">
                Leaf Learning
              </div>
              <div className="text-sm text-[var(--muted)]">
                Map the ideas that unlock the topic you actually want.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isLoading ? (
              <div className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-white/70 bg-white/70 px-3 py-2 text-sm font-semibold text-[var(--muted-strong)] shadow-sm backdrop-blur">
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                Working
              </div>
            ) : null}
            <Button
              className="border-white/75 bg-white/76 backdrop-blur"
              leftIcon={<RotateCcw aria-hidden="true" className="h-4 w-4" />}
              size="sm"
              variant="secondary"
              onClick={() => {
                void restartFlow().then((cleared) => {
                  if (cleared) {
                    setSessions([])
                    setSessionListError(false)
                  }
                })
              }}
            >
              Clear cache
            </Button>
          </div>
        </header>

        <section className="flex flex-1 items-start justify-center px-1 pb-6 pt-9 sm:pb-8 sm:pt-12">
          <div className="max-w-3xl text-center">
            <Eyebrow className="justify-center" tone="accent">
              Adaptive learning graph
            </Eyebrow>
            <h1 className="mt-4 font-serif-display text-4xl leading-[0.98] text-[var(--ink)] sm:text-6xl">
              Turn curiosity into a study path that keeps unfolding.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[var(--muted)] sm:text-base">
              Start with a topic, narrow it into the version you care about, and let the map grow into the exact prerequisites, concepts, and resources behind it.
            </p>
          </div>
        </section>

        <div className="relative mx-auto w-full max-w-5xl">
          <form onSubmit={handleSubmit}>
            <Panel className="mx-auto flex max-w-3xl flex-col gap-4 border-white/70 bg-white/78 p-4 backdrop-blur-xl sm:p-5">
              <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <label className="text-xl font-semibold text-[var(--leaf-deep)]" htmlFor="topic">
                    Ready to learn?
                  </label>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Examples: diffusion models, calculus for robotics, worldbuilding for fiction
                  </p>
                </div>
                <Button
                  className="self-start sm:self-auto"
                  disabled={isLoading}
                  isLoading={isLoading}
                  rightIcon={
                    !isLoading ? <ArrowRight aria-hidden="true" className="h-4 w-4" /> : null
                  }
                  type="submit"
                >
                  {isLoading ? `Exploring ${topic.trim() || 'your topic'}...` : 'Start exploring'}
                </Button>
              </div>

              <TextArea
                id="topic"
                className="min-h-28 border-white/80 bg-white/90 text-base leading-7"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="Name the topic, angle, or outcome you want to understand."
              />

              {error ? <StatusNotice tone="error">{error}</StatusNotice> : null}
            </Panel>
          </form>

          {isLoadingSessions || sessionListError || sessions.length ? (
            <Panel className="mx-auto mt-5 max-w-3xl border-white/60 bg-white/62 p-4 backdrop-blur-xl sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <Eyebrow>Continue a previous session</Eyebrow>
                {isLoadingSessions ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-[var(--muted)]" />
                ) : (
                  <span className="text-xs font-semibold text-[var(--muted)]">{sessions.length}</span>
                )}
              </div>
              {sessionListError ? (
                <StatusNotice className="mt-3" tone="error">
                  Previous sessions could not be loaded. You can still start a new topic.
                </StatusNotice>
              ) : null}
              {isLoadingSessions ? (
                <StatusNotice className="mt-3" tone="loading">
                  Finding saved learning maps...
                </StatusNotice>
              ) : null}
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    className="flex w-full items-center justify-between gap-4 rounded-[var(--radius-sm)] border border-white/70 bg-white/80 px-4 py-4 text-left transition hover:-translate-y-0.5 hover:border-[var(--leaf)]/45 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    type="button"
                    onClick={() => void loadSession(session.id)}
                  >
                    <div>
                      <div className="font-semibold">{session.root_topic}</div>
                      <div className="mt-1 inline-flex items-center gap-1.5 text-sm text-[var(--muted)]">
                        <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
                        {new Date(session.created_at).toLocaleString()}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--leaf-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--leaf-deep)]">
                      Phase {session.phase}
                    </span>
                  </button>
                ))}
              </div>
            </Panel>
          ) : null}
        </div>
      </div>
    </main>
  )
}
