import { ChevronRight } from 'lucide-react'

import { useSessionStore } from '../store/useSessionStore'
import { Button } from './ui'

interface DeepDiveButtonProps {
  nodeId: string
}

export function DeepDiveButton({ nodeId }: DeepDiveButtonProps) {
  const session = useSessionStore((state) => state.session)
  const deepDive = useSessionStore((state) => state.deepDive)
  const isLoading = useSessionStore((state) => state.isLoading)

  async function handleDeepDive() {
    if (!session || isLoading) return

    await deepDive(nodeId)
  }

  return (
    <button
      aria-busy={isLoading}
      className="rounded-full bg-[var(--ink)] px-5 py-3 text-sm font-semibold text-[var(--paper)] transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
      disabled={isLoading}
      type="button"
      onClick={() => void handleDeepDive()}
    >
      {isLoading ? 'Building roadmap...' : 'Deep Dive →'}
    </button>
  )
}
