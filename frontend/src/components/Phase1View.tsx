import { useMemo } from 'react'

import { useSessionStore } from '../store/useSessionStore'
import { DeepDiveButton } from './DeepDiveButton'
import { Phase1OptionCard } from './Phase1OptionCard'

export function Phase1View() {
  const session = useSessionStore((state) => state.session)
  const isLoading = useSessionStore((state) => state.isLoading)
  const selectTopic = useSessionStore((state) => state.selectTopic)
  const back = useSessionStore((state) => state.back)

  const { currentNode, pathNodes, childNodes } = useMemo(() => {
    if (!session || !session.current_phase1_node_id) {
      return { currentNode: null, pathNodes: [], childNodes: [] }
    }

    const current = session.nodes[session.current_phase1_node_id] ?? null
    if (!current) {
      return { currentNode: null, pathNodes: [], childNodes: [] }
    }

    const path = []
    let cursor: typeof current | undefined = current
    while (cursor) {
      path.push(cursor)
      cursor = cursor.parent_id ? session.nodes[cursor.parent_id] : undefined
    }
    path.reverse()

    const children = current.child_ids
      .map((childId) => session.nodes[childId])
      .filter((node): node is NonNullable<typeof node> => Boolean(node))

    return { currentNode: current, pathNodes: path, childNodes: children }
  }, [session])

  async function handleCrumbClick(index: number) {
    if (!session || index === pathNodes.length - 1) return
    const steps = pathNodes.length - 1 - index
    for (let count = 0; count < steps; count += 1) {
      await back()
    }
  }

  if (!session || !currentNode) {
    return null
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-6 text-[var(--ink)] sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[32px] border border-[var(--line)] bg-[var(--paper)] p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)]">
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted-strong)]">
            {pathNodes.map((node, index) => (
              <button
                key={node.id}
                className="rounded-full px-3 py-1.5 transition hover:bg-[var(--accent-soft)]"
                type="button"
                onClick={() => void handleCrumbClick(index)}
              >
                {node.label}
              </button>
            ))}
          </div>

          <section className="mt-6 rounded-[28px] bg-[linear-gradient(135deg,rgba(245,158,11,0.12),rgba(14,165,233,0.08),rgba(255,255,255,0.9))] p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
              Topic Narrowing
            </p>
            <h1 className="mt-3 max-w-3xl font-serif-display text-4xl leading-tight sm:text-5xl">
              {currentNode.label}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--muted)]">
              {currentNode.description ?? 'Choose the direction that best matches what you want to learn next.'}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-4">
              <DeepDiveButton nodeId={currentNode.id} />
              <span className="text-sm text-[var(--muted)]">
                Commit to this topic when it feels specific enough to study seriously.
              </span>
            </div>
          </section>

          <section className="mt-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-strong)]">
                  Next directions
                </p>
                <h2 className="mt-1 font-serif-display text-2xl">Pick the most promising branch</h2>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {isLoading
                ? Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-52 animate-pulse rounded-[24px] border border-[var(--line)] bg-[var(--panel)]"
                    />
                  ))
                : childNodes.map((node) => (
                    <Phase1OptionCard key={node.id} node={node} onSelect={(id) => void selectTopic(id)} />
                  ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
