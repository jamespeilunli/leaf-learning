import axios from 'axios'

import type { Phase, Session } from '../types'

const http = axios.create({
  baseURL: '/api',
})

export async function createSession(
  topic: string,
): Promise<{ session_id: string; session: Session }> {
  const response = await http.post('/session', { topic })
  return response.data
}

export async function getSession(id: string): Promise<Session> {
  const response = await http.get(`/session/${id}`)
  return response.data
}

export async function listSessions(): Promise<
  Array<{ id: string; root_topic: string; created_at: string; phase: Phase }>
> {
  const response = await http.get('/sessions')
  return response.data
}

export async function selectTopic(sessionId: string, nodeId: string): Promise<Session> {
  const response = await http.post(`/session/${sessionId}/select-topic`, { node_id: nodeId })
  return response.data
}

export async function back(sessionId: string): Promise<Session> {
  const response = await http.post(`/session/${sessionId}/back`)
  return response.data
}

export async function deepDive(
  sessionId: string,
  nodeId: string,
): Promise<{ session: Session }> {
  const response = await http.post(`/session/${sessionId}/deep-dive`, { node_id: nodeId })
  return response.data
}

export async function explainNode(
  sessionId: string,
  nodeId: string,
): Promise<{ explain_more_text: string }> {
  const response = await http.post(`/session/${sessionId}/node/${nodeId}/explain`)
  return response.data
}

export async function deleteNode(
  sessionId: string,
  nodeId: string,
): Promise<{ removed_node_ids: string[] }> {
  const response = await http.delete(`/session/${sessionId}/node/${nodeId}`)
  return response.data
}

export async function updateNodeState(
  sessionId: string,
  nodeId: string,
  node_state: 'learned' | 'grayed',
): Promise<Session> {
  const response = await http.patch(`/session/${sessionId}/node/${nodeId}/status`, { node_state })
  return response.data
}
