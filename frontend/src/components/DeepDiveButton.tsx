import { useState } from 'react'

import { useSessionStore } from '../store/useSessionStore'

interface DeepDiveButtonProps {
  nodeId: string
}

export function DeepDiveButton({ nodeId }: DeepDiveButtonProps) {
  const [projectify, setProjectify] = useState(false)
  const session = useSessionStore((state) => state.session)
  const deepDive = useSessionStore((state) => state.deepDive)
  const expandNode = useSessionStore((state) => state.expandNode)

  async function handleDeepDive() {
    if (!session) return

    await deepDive(nodeId, projectify)
    await expandNode(nodeId)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        className="rounded-full bg-[var(--ink)] px-5 py-3 text-sm font-semibold text-[var(--paper)] transition hover:bg-[var(--accent)]"
        type="button"
        onClick={() => void handleDeepDive()}
      >
        Deep Dive →
      </button>
      <label className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--ink)]">
        <input
          checked={projectify}
          className="h-4 w-4 accent-[var(--accent)]"
          type="checkbox"
          onChange={(event) => setProjectify(event.target.checked)}
        />
        Project example
      </label>
    </div>
  )
}
