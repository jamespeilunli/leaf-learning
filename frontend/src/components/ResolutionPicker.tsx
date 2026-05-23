import clsx from 'clsx'

import { useSessionStore } from '../store/useSessionStore'
import type { Resolution } from '../types'

const OPTIONS: Array<{
  value: Resolution
  title: string
  subtitle: string
  example: string
}> = [
  {
    value: 'intuitive',
    title: 'Intuitive',
    subtitle: 'Concepts, metaphors, the why',
    example: 'I want to know what a concept means and why it matters.',
  },
  {
    value: 'technical',
    title: 'Technical',
    subtitle: 'Formal definitions, the how',
    example: 'I want the exact mechanism, derivation, and formal framing.',
  },
]

interface ResolutionPickerProps {
  compact?: boolean
  closeOnSelect?: boolean
  onClose?: () => void
}

export function ResolutionPicker({
  compact = false,
  closeOnSelect = true,
  onClose,
}: ResolutionPickerProps) {
  const session = useSessionStore((state) => state.session)
  const setResolution = useSessionStore((state) => state.setResolution)

  async function handleSelect(value: Resolution) {
    await setResolution(value)
    if (closeOnSelect) {
      onClose?.()
    }
  }

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-strong)]">
          Depth
        </span>
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            className={clsx(
              'rounded-full border px-4 py-2 text-sm font-semibold transition',
              session?.resolution === option.value
                ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                : 'border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--ink)]',
            )}
            type="button"
            onClick={() => void handleSelect(option.value)}
          >
            {option.title}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(15,23,42,0.38)] px-4">
      <div className="w-full max-w-3xl rounded-[28px] border border-[var(--line)] bg-[var(--paper)] p-6 shadow-[0_36px_90px_rgba(15,23,42,0.24)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-strong)]">
              Resolution
            </p>
            <h3 className="mt-1 font-serif-display text-3xl">Choose your depth</h3>
          </div>
          {onClose ? (
            <button className="text-sm font-semibold text-[var(--muted)]" type="button" onClick={onClose}>
              Close
            </button>
          ) : null}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              className={clsx(
                'rounded-[24px] border p-5 text-left transition',
                session?.resolution === option.value
                  ? 'border-[var(--ink)] bg-[var(--accent-soft)]'
                  : 'border-[var(--line)] bg-white hover:-translate-y-0.5 hover:border-[var(--accent)]',
              )}
              type="button"
              onClick={() => void handleSelect(option.value)}
            >
              <div className="text-xl font-semibold">{option.title}</div>
              <div className="mt-2 text-sm font-medium text-[var(--muted-strong)]">{option.subtitle}</div>
              <p className="mt-4 text-sm leading-6 text-[var(--muted)]">{option.example}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
