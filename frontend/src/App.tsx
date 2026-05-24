import { useEffect } from 'react'

import axios from 'axios'
import { ReactFlowProvider } from 'reactflow'

import { GraphCanvas } from './components/GraphCanvas'
import { NodeChatPanel } from './components/NodeChatPanel'
import { Phase1View } from './components/Phase1View'
import { Phase2Sidebar } from './components/Phase2Sidebar'
import { StartScreen } from './components/StartScreen'
import { SESSION_STORAGE_KEY, useSessionStore } from './store/useSessionStore'

function App() {
  const session = useSessionStore((state) => state.session)
  const isLoading = useSessionStore((state) => state.isLoading)
  const loadSession = useSessionStore((state) => state.loadSession)

  useEffect(() => {
    const sessionId = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!sessionId) return

    void loadSession(sessionId).catch((error) => {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        localStorage.removeItem(SESSION_STORAGE_KEY)
      }
    })
  }, [loadSession])

  if (!session) {
    return <StartScreen key={isLoading ? 'loading' : 'start'} />
  }

  if (session.phase === '1') {
    return <Phase1View />
  }

  return (
    <main className="relative h-screen w-full overflow-hidden">
      <ReactFlowProvider>
        <GraphCanvas />
        <Phase2Sidebar />
        <NodeChatPanel />
      </ReactFlowProvider>
    </main>
  )
}

export default App
