import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import { CheckCircle2, ExternalLink, MessageCircle, Plus, X } from 'lucide-react'

import { useSessionStore } from '../store/useSessionStore'
import { Button, Eyebrow, IconButton, Panel, StatusNotice, TextArea } from './ui'

export function Phase2Sidebar() {
  const session = useSessionStore((state) => state.session)
  const selectedPhase2NodeId = useSessionStore((state) => state.selectedPhase2NodeId)
  const closeNodeDetails = useSessionStore((state) => state.closeNodeDetails)
  const markLearned = useSessionStore((state) => state.markLearned)
  const openChat = useSessionStore((state) => state.openChat)
  const suggestPrerequisite = useSessionStore((state) => state.suggestPrerequisite)
  const error = useSessionStore((state) => state.error)
  const [draft, setDraft] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const node = useMemo(() => {
    if (!session || !selectedPhase2NodeId) return null
    return session.nodes[selectedPhase2NodeId] ?? null
  }, [selectedPhase2NodeId, session])

  if (!session || !node || node.node_state === 'grayed') return null

  const sources = node.sources?.length ? node.sources : node.resource ? [node.resource] : []
  const isLearned = node.node_state === 'learned'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed || !node || isAdding) return

    setIsAdding(true)
    try {
      await suggestPrerequisite(node.id, trimmed)
      setDraft('')
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <aside className="absolute inset-x-3 bottom-3 top-auto z-30 flex max-h-[72svh] flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper)]/96 shadow-[var(--shadow-strong)] backdrop-blur md:inset-x-auto md:inset-y-4 md:right-4 md:max-h-none md:w-[390px]">
      <header className="border-b border-[var(--line)] px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Eyebrow tone="accent">Active node</Eyebrow>
            <h2 className="mt-2 text-xl font-bold leading-7 text-[var(--ink)]">{node.label}</h2>
          </div>
          <IconButton className="h-9 w-9 shrink-0" label="Close node details" onClick={closeNodeDetails}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        {node.description ? <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{node.description}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            leftIcon={<CheckCircle2 aria-hidden="true" className="h-4 w-4" />}
            size="sm"
            variant={isLearned ? 'success' : 'primary'}
            onClick={() => void markLearned(node.id)}
          >
            {isLearned ? 'Learned' : 'Mark learned'}
          </Button>
          <Button
            leftIcon={<MessageCircle aria-hidden="true" className="h-4 w-4" />}
            size="sm"
            variant="secondary"
            onClick={() => openChat(node.id)}
          >
            Ask
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <section>
          <div className="flex items-center justify-between">
            <Eyebrow>Sources</Eyebrow>
            <span className="text-xs font-semibold text-slate-400">{sources.length}</span>
          </div>
          <div className="mt-3 space-y-3">
            {sources.length ? (
              sources.map((source) => (
                <a
                  key={source.url}
                  className="block rounded-[var(--radius-sm)] border border-[var(--line)] bg-white p-4 transition hover:border-[var(--accent)] hover:shadow-[0_12px_28px_rgba(15,23,42,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  href={source.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-bold leading-5 text-[var(--ink)]">{source.title}</div>
                    <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{source.description}</p>
                </a>
              ))
            ) : (
              <StatusNotice tone="loading">
                Sources are loading for this node.
              </StatusNotice>
            )}
          </div>
        </section>

        <Panel className="mt-6 border-[var(--line)] bg-white/72 p-4 shadow-none">
          <Eyebrow>Add missing prerequisite</Eyebrow>
          <form className="mt-3" onSubmit={handleSubmit}>
            <TextArea
              className="min-h-24"
              invalid={Boolean(error)}
              placeholder="Example: add Fourier transforms as a missing prerequisite"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            {error ? <StatusNotice className="mt-3" tone="error">{error}</StatusNotice> : null}
            <Button
              className="mt-3"
              disabled={!draft.trim() || isAdding}
              isLoading={isAdding}
              leftIcon={<Plus aria-hidden="true" className="h-4 w-4" />}
              size="sm"
              type="submit"
            >
              Add inactive node
            </Button>
          </form>
        </Panel>
      </div>
    </aside>
  )
}
