import { useSessionStore } from '../store/useSessionStore'

interface DeepDiveButtonProps {
  nodeId: string
}

export function DeepDiveButton({ nodeId }: DeepDiveButtonProps) {
  const session = useSessionStore((state) => state.session)
  const deepDive = useSessionStore((state) => state.deepDive)

  async function handleDeepDive() {
    if (!session) return

    await deepDive(nodeId)
  }

  return (
    <button
      className="rounded-full bg-[var(--ink)] px-5 py-3 text-sm font-semibold text-[var(--paper)] transition hover:bg-[var(--accent)]"
      type="button"
      onClick={() => void handleDeepDive()}
    >
      Deep Dive →
    </button>
  )
}
