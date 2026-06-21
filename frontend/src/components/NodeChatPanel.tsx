import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import { Send, X } from 'lucide-react'

import { streamSSE } from '../hooks/useSSE'
import { useSessionStore } from '../store/useSessionStore'
import type { ChatMessage } from '../types'
import { stripChatHistory } from '../lib/sessionPayload'
import { Button, Eyebrow, IconButton, StatusNotice, TextArea } from './ui'

type LocalMessage = ChatMessage & { id: string }

function toLocalMessage(message: ChatMessage, index: number): LocalMessage {
  return { ...message, id: `${message.created_at}-${index}` }
}

export function NodeChatPanel() {
  const session = useSessionStore((state) => state.session)
  const sessionId = useSessionStore((state) => state.sessionId)
  const chatOpenNodeId = useSessionStore((state) => state.chatOpenNodeId)
  const closeChat = useSessionStore((state) => state.closeChat)
  const appendChatExchange = useSessionStore((state) => state.appendChatExchange)

  const node = useMemo(() => {
    if (!session || !chatOpenNodeId) return null
    return session.nodes[chatOpenNodeId] ?? null
  }, [chatOpenNodeId, session])

  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<LocalMessage[]>(
    () => node?.chat_history.map(toLocalMessage) ?? [],
  )
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight })
  }, [messages])

  useEffect(() => {
    setMessages(node?.chat_history.map(toLocalMessage) ?? [])
    setDraft('')
    setError(null)
  }, [node?.id, node?.chat_history])

  if (!session || !sessionId || !node) {
    return null
  }

  const activeSession = session
  const activeNode = node
  const activeSessionId = sessionId
  const activeNodeId = activeNode.id

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed || isStreaming) return

    const userMessage: LocalMessage = {
      id: `user-${crypto.randomUUID()}`,
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
    }
    const assistantMessage: LocalMessage = {
      id: `assistant-${crypto.randomUUID()}`,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    }

    setDraft('')
    setError(null)
    setIsStreaming(true)
    setMessages((current) => [...current, userMessage, assistantMessage])

    let completed = false
    let fullResponse = ''
    try {
      for await (const eventItem of streamSSE(`/api/session/${activeSessionId}/node/${activeNodeId}/chat`, {
        message: trimmed,
        session: stripChatHistory(activeSession),
        history: activeNode.chat_history.slice(-20),
      })) {
        if (eventItem.event === 'token') {
          const data = eventItem.data as { text?: string }
          fullResponse += data.text ?? ''
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, content: message.content + (data.text ?? '') }
                : message,
            ),
          )
        }
        if (eventItem.event === 'stream_error') {
          const data = eventItem.data as { message?: string }
          setError(data.message ?? 'Chat stream failed.')
        }
        if (eventItem.event === 'stream_done') {
          completed = true
        }
      }

      if (completed) {
        appendChatExchange(activeNodeId, trimmed, fullResponse)
      }
    } catch (streamError) {
      setError(streamError instanceof Error ? streamError.message : 'Chat stream failed.')
    } finally {
      setIsStreaming(false)
    }
  }

  return (
    <aside className="absolute inset-x-3 bottom-3 top-12 z-40 flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper)] shadow-[var(--shadow-strong)] md:inset-x-auto md:inset-y-4 md:right-[420px] md:w-[360px]">
      <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
        <div>
          <Eyebrow>Node chat</Eyebrow>
          <h2 className="mt-1 text-lg font-semibold">{node.label}</h2>
        </div>
        <IconButton label="Close chat" onClick={closeChat}>
          <X className="h-4 w-4" />
        </IconButton>
      </header>

      <div ref={containerRef} className="flex-1 space-y-3 overflow-y-auto bg-[var(--panel)] px-4 py-4">
        {!messages.length ? (
          <StatusNotice tone="info">
            Ask a scoped question about this concept, prerequisite, or source list.
          </StatusNotice>
        ) : null}
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === 'user'
                ? 'ml-10 rounded-[var(--radius-sm)] bg-[var(--ink)] px-4 py-3 text-sm leading-6 text-[var(--paper)]'
                : 'mr-10 rounded-[var(--radius-sm)] bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)] shadow-sm'
            }
          >
            {message.content || (isStreaming && message.role === 'assistant' ? '...' : '')}
          </div>
        ))}
      </div>

      <form className="border-t border-[var(--line)] p-4" onSubmit={handleSend}>
        <TextArea
          className="min-h-24"
          invalid={Boolean(error)}
          placeholder="Ask about this node..."
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        {error ? <StatusNotice className="mt-3" tone="error">{error}</StatusNotice> : null}
        <div className="mt-3 flex justify-end">
          <Button
            disabled={isStreaming}
            isLoading={isStreaming}
            rightIcon={<Send aria-hidden="true" className="h-4 w-4" />}
            size="sm"
            type="submit"
          >
            {isStreaming ? 'Streaming...' : 'Send'}
          </Button>
        </div>
      </form>
    </aside>
  )
}
