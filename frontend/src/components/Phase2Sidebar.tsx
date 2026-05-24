import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import { CheckCircle2, ExternalLink, Loader2, Plus, X } from 'lucide-react'

import { useSessionStore } from '../store/useSessionStore'

export function Phase2Sidebar() {
  const session = useSessionStore((state) => state.session)
  const selectedPhase2NodeId = useSessionStore((state) => state.selectedPhase2NodeId)
  const closeNodeDetails = useSessionStore((state) => state.closeNodeDetails)
  const markLearned = useSessionStore((state) => state.markLearned)
  const suggestPrerequisite = useSessionStore((state) => state.suggestPrerequisite)
  const error = useSessionStore((state) => state.error)
  const [draft, setDraft] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const node = useMemo(() => {
    if (!session || !selectedPhase2NodeId) return null
    return session.nodes[selectedPhase2NodeId] ?? null
  }, [selectedPhase2NodeId, session])

  if (!session || !node || node.node_state === 'grayed') return null

  const primarySource = node.sources?.[0] ?? node.resource
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
    <aside className="absolute inset-y-4 right-4 z-30 flex w-[390px] flex-col overflow-hidden rounded-[10px] border border-slate-300 bg-[#fbfaf5]/95 shadow-[0_32px_90px_rgba(15,23,42,0.22)] backdrop-blur">
      <header className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
              Active node
            </p>
            <h2 className="mt-2 text-xl font-bold leading-7 text-[var(--ink)]">{node.label}</h2>
          </div>
          <button
            aria-label="Close node details"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-500 transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            type="button"
            onClick={closeNodeDetails}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {node.description ? <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{node.description}</p> : null}
        <button
          className={[
            'mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition',
            isLearned
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--accent)]',
          ].join(' ')}
          type="button"
          onClick={() => void markLearned(node.id)}
        >
          <CheckCircle2 className="h-4 w-4" />
          {isLearned ? 'Learned' : 'Mark learned'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <section>
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Source</h3>
            <span className="text-xs font-semibold text-slate-400">{primarySource ? 1 : 0}</span>
          </div>
          <div className="mt-3 space-y-3">
            {primarySource ? (
              <a
                className="block rounded-[8px] border border-slate-200 bg-white p-4 transition hover:border-[var(--accent)] hover:shadow-[0_12px_28px_rgba(15,23,42,0.10)]"
                href={primarySource.url}
                rel="noreferrer"
                target="_blank"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-bold leading-5 text-[var(--ink)]">{primarySource.title}</div>
                  <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{primarySource.description}</p>
              </a>
            ) : (
              <div className="rounded-[8px] border border-dashed border-slate-300 bg-white/60 p-4 text-sm leading-6 text-[var(--muted)]">
                Sources are loading for this node.
              </div>
            )}
          </div>
        </section>

        <section className="mt-6 border-t border-slate-200 pt-5">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Add missing prerequisite
          </h3>
          <form className="mt-3" onSubmit={handleSubmit}>
            <textarea
              className="min-h-24 w-full resize-none rounded-[8px] border border-slate-300 bg-white p-3 text-sm leading-6 outline-none transition focus:border-[var(--accent)]"
              placeholder="Example: add Fourier transforms as a missing prerequisite"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            {error ? <p className="mt-2 text-xs font-semibold text-[var(--danger)]">{error}</p> : null}
            <button
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-4 py-2 text-sm font-bold text-[var(--paper)] transition hover:bg-[var(--accent)] disabled:opacity-50"
              disabled={!draft.trim() || isAdding}
              type="submit"
            >
              {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add inactive node
            </button>
          </form>
        </section>
      </div>
    </aside>
  )
}
