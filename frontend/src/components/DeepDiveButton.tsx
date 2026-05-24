import { ChevronRight } from 'lucide-react'

import { useSessionStore } from '../store/useSessionStore'
import { Button } from './ui'

interface DeepDiveButtonProps {
  nodeId: string
}

export function DeepDiveButton({ nodeId }: DeepDiveButtonProps) {
  const session = useSessionStore((state) => state.session)
  const deepDive = useSessionStore((state) => state.deepDive)
  const expandNode = useSessionStore((state) => state.expandNode)

  async function handleDeepDive() {
    if (!session) return

    await deepDive(nodeId)
    await expandNode(nodeId)
  }

  return (
    <Button
      rightIcon={<ChevronRight aria-hidden="true" className="h-4 w-4" />}
      type="button"
      onClick={() => void handleDeepDive()}
    >
      Deep Dive
    </Button>
  )
}
