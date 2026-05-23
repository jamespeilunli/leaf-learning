export async function* streamSSE(
  url: string,
  body: object,
): AsyncGenerator<{ event: string; data: unknown }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Streaming body is unavailable.')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = 'message'

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line) {
        continue
      }

      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim()
        continue
      }

      if (line.startsWith('data: ')) {
        const raw = line.slice(6)
        try {
          yield { event: currentEvent, data: JSON.parse(raw) }
        } catch {
          yield { event: currentEvent, data: raw }
        }
        currentEvent = 'message'
      }
    }
  }
}
