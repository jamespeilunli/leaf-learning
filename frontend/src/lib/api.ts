import axios from 'axios'

import type { GraphEdge, GraphNode, Session } from '../types'
import { getApiBaseUrl } from './apiConfig'
import { getOpenAiApiKeyHeaders } from './openAiApiKey'
import { stripChatHistory } from './sessionPayload'

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

export async function createSession(
  topic: string,
): Promise<{ session_id: string; session: Session }> {
  return post('/session', { topic })
}

export async function generatePhase1Children(
  session: Session,
  nodeId: string,
): Promise<{ children: GraphNode[] }> {
  return post('/phase1/children', { session: stripChatHistory(session), node_id: nodeId })
}

export async function explainNode(
  sessionId: string,
  nodeId: string,
  session: Session,
): Promise<{ explain_more_text: string }> {
  return post(`/session/${sessionId}/node/${nodeId}/explain`, {
    session: stripChatHistory(session),
  })
}

export async function suggestPrerequisite(
  sessionId: string,
  nodeId: string,
  message: string,
  session: Session,
): Promise<{ node: GraphNode; edge: GraphEdge }> {
  return post(`/session/${sessionId}/node/${nodeId}/suggest-prerequisite`, {
    message,
    session: stripChatHistory(session),
  })
}

export async function prefetchPhase2(
  sessionId: string,
  session: Session,
  startNodeIds: string[],
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  return post(`/session/${sessionId}/phase2/prefetch`, {
    session: stripChatHistory(session),
    start_node_ids: startNodeIds,
  })
}
