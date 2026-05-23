import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowUp, Bot, Loader2, Server, Sparkles, Terminal } from 'lucide-react'

function App() {
  const [message, setMessage] = useState(
    'Give me three concrete ideas for this hackathon app.',
  )
  const [reply, setReply] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = message.trim()

    if (!trimmed || isLoading) {
      return
    }

    setIsLoading(true)
    setError('')
    setReply('')

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: trimmed }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'The backend returned an error.')
      }

      setReply(data.reply)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-[#15120d]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-5 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between border-b border-[#d8d0c1] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#15120d] text-[#f7f5ef]">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8b3f2f]">
                OpenAI Starter
              </p>
              <h1 className="font-serif text-2xl font-semibold leading-none sm:text-3xl">
                FastAPI + React
              </h1>
            </div>
          </div>
          <a
            className="hidden rounded-md border border-[#15120d] px-3 py-2 text-sm font-semibold transition hover:bg-[#15120d] hover:text-[#f7f5ef] sm:inline-flex"
            href="https://platform.openai.com/docs/api-reference/responses"
            target="_blank"
          >
            API docs
          </a>
        </header>

        <section className="grid flex-1 items-stretch gap-5 py-6 lg:grid-cols-[0.9fr_1.1fr]">
          <aside className="flex flex-col justify-between border border-[#d8d0c1] bg-[#fffaf0] p-5 shadow-[8px_8px_0_#15120d]">
            <div>
              <div className="mb-8 inline-flex items-center gap-2 rounded-md bg-[#e8d17d] px-3 py-2 text-sm font-semibold">
                <Server className="h-4 w-4" aria-hidden="true" />
                Backend lives in /backend
              </div>
              <h2 className="max-w-md font-serif text-5xl font-semibold leading-[0.95] sm:text-6xl">
                A clean base for API-backed AI features.
              </h2>
              <p className="mt-5 max-w-md text-lg leading-8 text-[#5f574c]">
                The browser talks to FastAPI through Vite's proxy. FastAPI calls
                OpenAI with the server-side API key, then returns a typed JSON
                response.
              </p>
            </div>

            <div className="mt-10 grid gap-3 text-sm font-medium text-[#5f574c]">
              <div className="flex items-center gap-3 border-t border-[#d8d0c1] pt-4">
                <Terminal className="h-4 w-4 text-[#8b3f2f]" aria-hidden="true" />
                <span>Run FastAPI on port 8000</span>
              </div>
              <div className="flex items-center gap-3">
                <Bot className="h-4 w-4 text-[#8b3f2f]" aria-hidden="true" />
                <span>Run Vite on port 5173</span>
              </div>
            </div>
          </aside>

          <section className="flex flex-col border border-[#d8d0c1] bg-white">
            <div className="border-b border-[#d8d0c1] px-5 py-4">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8b3f2f]">
                Live request
              </p>
              <h2 className="mt-1 font-serif text-3xl font-semibold">
                Ask the backend
              </h2>
            </div>

            <form className="flex flex-1 flex-col gap-4 p-5" onSubmit={handleSubmit}>
              <label className="text-sm font-semibold" htmlFor="prompt">
                Prompt
              </label>
              <textarea
                id="prompt"
                className="min-h-40 resize-none rounded-md border border-[#d8d0c1] bg-[#fffcf5] p-4 text-base leading-7 outline-none transition focus:border-[#8b3f2f] focus:ring-4 focus:ring-[#e8d17d]/40"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />

              <button
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#15120d] px-5 font-semibold text-[#f7f5ef] transition hover:bg-[#8b3f2f] disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                ) : (
                  <ArrowUp className="h-5 w-5" aria-hidden="true" />
                )}
                Send
              </button>

              <div className="min-h-48 rounded-md border border-[#d8d0c1] bg-[#f7f5ef] p-4">
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#8b3f2f]">
                  Response
                </p>
                {error ? (
                  <p className="leading-7 text-[#9b2f24]">{error}</p>
                ) : reply ? (
                  <p className="whitespace-pre-wrap leading-7 text-[#2b261f]">
                    {reply}
                  </p>
                ) : (
                  <p className="leading-7 text-[#766c5e]">
                    Submit a prompt to test the FastAPI route and OpenAI Responses
                    API.
                  </p>
                )}
              </div>
            </form>
          </section>
        </section>
      </div>
    </main>
  )
}

export default App
