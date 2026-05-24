import { useSessionStore } from '../store/useSessionStore'

export function resetSessionStore() {
  useSessionStore.setState({
    sessionId: null,
    session: null,
    isLoading: false,
    streamingNodeIds: new Set<string>(),
    explainingNodeIds: new Set<string>(),
    chatOpenNodeId: null,
    selectedPhase2NodeId: null,
    error: null,
  })
}
