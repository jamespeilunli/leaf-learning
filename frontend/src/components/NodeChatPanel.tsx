import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import { X } from 'lucide-react'

import { streamSSE } from '../hooks/useSSE'
import { useSessionStore } from '../store/useSessionStore'
import type { ChatMessage } from '../types'

type LocalMessage = ChatMessage & { id: string }

function toLocalMessage(message: ChatMessage, index: number): LocalMessage {
  return { ...message, id: `${message.created_at}-${index}` }
}

export function NodeChatPanel() {
  const session = useSessionStore((state) => state.session)
  const sessionId = useSessionStore((state) => state.sessionId)
  const chatOpenNodeId = useSessionStore((state) => state.chatOpenNodeId)
  const closeChat = useSessionStore((state) => state.closeChat)
  const loadSession = useSessionStore((state) => state.loadSession)

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

  if (!session || !sessionId || !node) {
    return null
  }

  const activeSessionId = sessionId
  const activeNodeId = node.id

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

    try {
      for await (const eventItem of streamSSE(`/api/session/${activeSessionId}/node/${activeNodeId}/chat`, {
        message: trimmed,
      })) {
        if (eventItem.event === 'token') {
          const data = eventItem.data as { text?: string }
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
      }

      await loadSession(activeSessionId)
    } catch (streamError) {
      setError(streamError instanceof Error ? streamError.message : 'Chat stream failed.')
    } finally {
      setIsStreaming(false)
    }
  }

  return (
    <aside className="absolute inset-y-4 right-4 z-30 flex w-[360px] flex-col overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--paper)] shadow-[0_32px_90px_rgba(15,23,42,0.22)]">
      <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-strong)]">
            Node Chat
          </p>
          <h2 className="mt-1 text-lg font-semibold">{node.label}</h2>
        </div>
        <button className="rounded-full border border-[var(--line)] p-2 text-[var(--muted)]" type="button" onClick={closeChat}>
          <X className="h-4 w-4" />
        </button>
      </header>

      <div ref={containerRef} className="flex-1 space-y-3 overflow-y-auto bg-[var(--panel)] px-4 py-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === 'user'
                ? 'ml-10 rounded-[18px] bg-[var(--ink)] px-4 py-3 text-sm leading-6 text-[var(--paper)]'
                : 'mr-10 rounded-[18px] bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)]'
            }
          >
            {message.content || (isStreaming && message.role === 'assistant' ? '...' : '')}
          </div>
        ))}
      </div>

      <form className="border-t border-[var(--line)] p-4" onSubmit={handleSend}>
        <textarea
          className="min-h-24 w-full resize-none rounded-[18px] border border-[var(--line)] bg-white p-3 text-sm leading-6 outline-none focus:border-[var(--accent)]"
          placeholder="Ask about this node..."
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        {error ? <p className="mt-2 text-xs text-[var(--danger)]">{error}</p> : null}
        <div className="mt-3 flex justify-end">
          <button
            className="rounded-full bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-[var(--paper)] transition hover:bg-[var(--accent)] disabled:opacity-60"
            disabled={isStreaming}
            type="submit"
          >
            {isStreaming ? 'Streaming...' : 'Send'}
          </button>
        </div>
      </form>
    </aside>
  )
}
