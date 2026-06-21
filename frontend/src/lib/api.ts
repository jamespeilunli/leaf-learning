import axios from 'axios'

import type { GraphEdge, GraphNode, Phase, Session } from '../types'
import { getApiBaseUrl } from './apiConfig'
import { getOpenAiApiKeyHeaders } from './openAiApiKey'

const http = axios.create({
  baseURL: getApiBaseUrl(),
})

function requestConfig(): { headers: Record<string, string> } | undefined {
  const headers = getOpenAiApiKeyHeaders()
  return Object.keys(headers).length ? { headers } : undefined
}

async function post<T>(url: string, body?: object): Promise<T> {
  const config = requestConfig()
  const response = config
    ? await http.post(url, body, config)
    : body === undefined
      ? await http.post(url)
      : await http.post(url, body)
  return response.data
}

async function get<T>(url: string): Promise<T> {
  const config = requestConfig()
  const response = config ? await http.get(url, config) : await http.get(url)
  return response.data
}

async function del<T>(url: string): Promise<T> {
  const config = requestConfig()
  const response = config ? await http.delete(url, config) : await http.delete(url)
  return response.data
}

async function patch<T>(url: string, body: object): Promise<T> {
  const config = requestConfig()
  const response = config ? await http.patch(url, body, config) : await http.patch(url, body)
  return response.data
}

export async function createSession(
  topic: string,
): Promise<{ session_id: string; session: Session }> {
  return post('/session', { topic })
}

export async function getSession(id: string): Promise<Session> {
  return get(`/session/${id}`)
}

export async function listSessions(): Promise<
  Array<{ id: string; root_topic: string; created_at: string; phase: Phase }>
> {
  return get('/sessions')
}

export async function clearSessions(): Promise<{ deleted_count: number }> {
  return del('/sessions')
}

export async function selectTopic(sessionId: string, nodeId: string): Promise<Session> {
  return post(`/session/${sessionId}/select-topic`, { node_id: nodeId })
}

export async function expandPhase1Topic(sessionId: string, nodeId: string): Promise<Session> {
  return post(`/session/${sessionId}/phase1-expand`, { node_id: nodeId })
}

export async function back(sessionId: string): Promise<Session> {
  return post(`/session/${sessionId}/back`)
}

export async function deepDive(
  sessionId: string,
  nodeId: string,
): Promise<{ session: Session }> {
  return post(`/session/${sessionId}/deep-dive`, { node_id: nodeId })
}

export async function explainNode(
  sessionId: string,
  nodeId: string,
): Promise<{ explain_more_text: string }> {
  return post(`/session/${sessionId}/node/${nodeId}/explain`)
}

export async function deleteNode(
  sessionId: string,
  nodeId: string,
): Promise<{ removed_node_ids: string[] }> {
  return del(`/session/${sessionId}/node/${nodeId}`)
}

export async function suggestPrerequisite(
  sessionId: string,
  nodeId: string,
  message: string,
): Promise<{ node: GraphNode; edge: GraphEdge }> {
  return post(`/session/${sessionId}/node/${nodeId}/suggest-prerequisite`, { message })
}

export async function updateNodeState(
  sessionId: string,
  nodeId: string,
  node_state: 'learned' | 'grayed',
): Promise<Session> {
  return patch(`/session/${sessionId}/node/${nodeId}/status`, { node_state })
}
