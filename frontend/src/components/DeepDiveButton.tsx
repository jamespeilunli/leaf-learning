import { useState } from 'react'

import { useSessionStore } from '../store/useSessionStore'
import { ResolutionPicker } from './ResolutionPicker'

interface DeepDiveButtonProps {
  nodeId: string
}

export function DeepDiveButton({ nodeId }: DeepDiveButtonProps) {
  const session = useSessionStore((state) => state.session)
  const deepDive = useSessionStore((state) => state.deepDive)
  const expandNode = useSessionStore((state) => state.expandNode)
  const [showPicker, setShowPicker] = useState(false)

  async function handleDeepDive() {
    if (!session) return
    if (!session.resolution) {
      setShowPicker(true)
      return
    }

    await deepDive(nodeId)
    await expandNode(nodeId)
  }

  async function handleResolutionCloseThenDive() {
    setShowPicker(false)
    await deepDive(nodeId)
    await expandNode(nodeId)
  }

  return (
    <>
      <button
        className="rounded-full bg-[var(--ink)] px-5 py-3 text-sm font-semibold text-[var(--paper)] transition hover:bg-[var(--accent)]"
        type="button"
        onClick={() => void handleDeepDive()}
      >
        Deep Dive →
      </button>

      {showPicker ? (
        <div>
          <ResolutionPicker closeOnSelect={false} onClose={() => setShowPicker(false)} />
          <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
            <button
              className="rounded-full bg-[var(--ink)] px-5 py-3 text-sm font-semibold text-[var(--paper)] disabled:opacity-50"
              disabled={!session?.resolution}
              type="button"
              onClick={() => void handleResolutionCloseThenDive()}
            >
              Continue to roadmap
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
