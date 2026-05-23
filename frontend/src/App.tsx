import { GraphCanvas } from './components/GraphCanvas'
import { NodeChatPanel } from './components/NodeChatPanel'
import { Phase1View } from './components/Phase1View'
import { StartScreen } from './components/StartScreen'
import { useSessionStore } from './store/useSessionStore'

function App() {
  const session = useSessionStore((state) => state.session)
  const isLoading = useSessionStore((state) => state.isLoading)
  const chatOpenNodeId = useSessionStore((state) => state.chatOpenNodeId)

  if (!session) {
    return <StartScreen key={isLoading ? 'loading' : 'start'} />
  }

  if (session.phase === '1') {
    return <Phase1View />
  }

  return (
    <main className="relative h-screen w-full overflow-hidden">
      <GraphCanvas />
      {chatOpenNodeId ? <NodeChatPanel key={chatOpenNodeId} /> : null}
    </main>
  )
}

export default App
