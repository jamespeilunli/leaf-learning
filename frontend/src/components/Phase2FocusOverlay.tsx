import { Check, ExternalLink, Loader2, MessageSquareText, Trash2, X, X as XIcon } from 'lucide-react'

import { useSessionStore } from '../store/useSessionStore'
import type { GraphNode } from '../types'

interface Phase2FocusOverlayProps {
  node: GraphNode
  onClose: () => void
}

export function Phase2FocusOverlay({ node, onClose }: Phase2FocusOverlayProps) {
  const explainNode = useSessionStore((state) => state.explainNode)
  const expandNode = useSessionStore((state) => state.expandNode)
  const markLearned = useSessionStore((state) => state.markLearned)
  const deleteNode = useSessionStore((state) => state.deleteNode)
  const openChat = useSessionStore((state) => state.openChat)
  const explainingNodeIds = useSessionStore((state) => state.explainingNodeIds)
  const streamingNodeIds = useSessionStore((state) => state.streamingNodeIds)

  const isExplaining = explainingNodeIds.has(node.id)
  const isExpanding = streamingNodeIds.has(node.id)
  const hasExplanation = Boolean(node.explain_more_text && node.explain_more_text !== '__known__')
  const isKnownGhost = node.explain_more_text === '__known__'
  const isLearned = node.node_state === 'learned'

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-[rgba(15,23,42,0.32)] px-4 py-8 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <aside
        aria-label={`${node.label} details`}
        className="max-h-[min(760px,calc(100vh-4rem))] w-full max-w-[560px] overflow-y-auto rounded-[32px] border border-white/70 bg-[var(--paper)] p-6 shadow-[0_32px_90px_rgba(15,23,42,0.24)]"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-strong)]">
              {node.node_state === 'grayed' ? 'Prerequisite focus' : isLearned ? 'Known topic' : 'Expanded topic'}
            </p>
            <h2 className="mt-2 font-serif-display text-[30px] leading-none text-[var(--ink)]">{node.label}</h2>
          </div>
          <button
            aria-label="Close details"
            className="rounded-full border border-[var(--line)] p-2 text-[var(--muted-strong)] transition hover:border-[var(--accent)] hover:text-[var(--ink)]"
            type="button"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {node.description ? (
          <p className="mt-4 text-sm leading-7 text-[var(--muted)]">{node.description}</p>
        ) : null}

        {node.node_state === 'grayed' ? (
          <>
            {isKnownGhost ? (
              <div className="mt-5 rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-4">
                <p className="text-sm font-semibold text-emerald-800">This prerequisite is already in your known set.</p>
              </div>
            ) : null}

            {isExplaining ? (
              <div className="mt-5 rounded-[24px] border border-[var(--line)] bg-[var(--panel)] p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-strong)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Explaining the boundary
                </div>
                <div className="mt-3 space-y-2">
                  <div className="h-3 animate-pulse rounded bg-white" />
                  <div className="h-3 w-5/6 animate-pulse rounded bg-white" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-white" />
                </div>
              </div>
            ) : null}

            {hasExplanation ? (
              <div className="mt-5 rounded-[24px] border border-[var(--line)] bg-[var(--panel)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-strong)]">
                  Explain more
                </p>
                <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{node.explain_more_text}</p>
              </div>
            ) : null}

            {!isKnownGhost ? (
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]"
                  type="button"
                  onClick={() => void markLearned(node.id)}
                >
                  <Check className="h-4 w-4" />
                  Know
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-[var(--paper)] transition hover:bg-[var(--accent)]"
                  type="button"
                  onClick={() => void expandNode(node.id)}
                >
                  {isExpanding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {!isExpanding ? <XIcon className="h-4 w-4" /> : null}
                  Don&apos;t know
                </button>
                <button
                  className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]"
                  type="button"
                  onClick={() => void explainNode(node.id)}
                >
                  Explain more
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="mt-5 rounded-[24px] border border-[var(--line)] bg-[var(--panel)] p-4">
              {isExpanding ? (
                <div className="space-y-2">
                  <div className="h-4 animate-pulse rounded bg-white" />
                  <div className="h-4 w-3/4 animate-pulse rounded bg-white" />
                  <div className="h-14 animate-pulse rounded bg-white" />
                </div>
              ) : node.resource ? (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-strong)]">
                    Resource
                  </p>
                  <a
                    className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)] hover:underline"
                    href={node.resource.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {node.resource.title}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{node.resource.description}</p>
                </>
              ) : (
                <p className="text-sm leading-7 text-[var(--muted)]">
                  Waiting for the resource and prerequisite breakdown to load.
                </p>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {isLearned ? (
                <span className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
                  <span className="inline-flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    Know
                  </span>
                </span>
              ) : (
                <button
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-[var(--paper)] transition hover:bg-[var(--accent)]"
                  type="button"
                  onClick={() => void markLearned(node.id)}
                >
                  <Check className="h-4 w-4" />
                  Know
                </button>
              )}
              <button
                className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]"
                type="button"
                onClick={() => openChat(node.id)}
              >
                <MessageSquareText className="h-4 w-4" />
                Chat
              </button>
              {node.parent_id ? (
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--muted-strong)] transition hover:border-[var(--danger)] hover:text-[var(--danger)]"
                  type="button"
                  onClick={() => {
                    void deleteNode(node.id)
                    onClose()
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              ) : null}
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
