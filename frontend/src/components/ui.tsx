import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { Loader2 } from 'lucide-react'

import { cn } from '../lib/cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type ButtonSize = 'sm' | 'md' | 'lg'

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'border-[var(--accent-strong)] bg-[var(--accent-strong)] text-white shadow-[0_12px_26px_rgba(36,72,50,0.22)] hover:border-[var(--accent)] hover:bg-[var(--accent)]',
  secondary:
    'border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] shadow-[0_10px_24px_rgba(23,33,23,0.08)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)]',
  ghost:
    'border-transparent bg-transparent text-[var(--muted-strong)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-strong)]',
  danger:
    'border-[var(--danger)] bg-[var(--danger)] text-white shadow-[0_12px_26px_rgba(180,35,24,0.18)] hover:bg-[#941f16]',
  success:
    'border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)] hover:bg-[#cfeedd]',
}

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-xs',
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-12 px-5 text-sm',
}

interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  isLoading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  size?: ButtonSize
  variant?: ButtonVariant
}

export function Button({
  children,
  className,
  disabled,
  isLoading = false,
  leftIcon,
  rightIcon,
  size = 'md',
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] border font-semibold transition duration-200 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper)]',
        'disabled:translate-y-0 disabled:opacity-55',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      disabled={disabled || isLoading}
      type={type}
      {...props}
    >
      {isLoading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : leftIcon}
      <span>{children}</span>
      {rightIcon}
    </button>
  )
}

interface IconButtonProps extends ComponentPropsWithoutRef<'button'> {
  label: string
  variant?: ButtonVariant
}

export function IconButton({
  children,
  className,
  label,
  type = 'button',
  variant = 'secondary',
  ...props
}: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={cn(
        'grid h-10 w-10 place-items-center rounded-full border transition duration-200 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2',
        buttonVariants[variant],
        className,
      )}
      title={label}
      type={type}
      {...props}
    >
      {children}
    </button>
  )
}

interface PanelProps extends ComponentPropsWithoutRef<'section'> {
  density?: 'normal' | 'compact'
}

export function Panel({ children, className, density = 'normal', ...props }: PanelProps) {
  return (
    <section
      className={cn(
        'rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper)] shadow-[var(--shadow-soft)]',
        density === 'normal' ? 'p-5' : 'p-4',
        className,
      )}
      {...props}
    >
      {children}
    </section>
  )
}

interface EyebrowProps extends ComponentPropsWithoutRef<'p'> {
  tone?: 'accent' | 'muted' | 'amber' | 'success'
}

export function Eyebrow({ children, className, tone = 'muted', ...props }: EyebrowProps) {
  const tones = {
    accent: 'text-[var(--accent)]',
    amber: 'text-[var(--amber)]',
    muted: 'text-[var(--muted-strong)]',
    success: 'text-[var(--success)]',
  }

  return (
    <p
      className={cn(
        'text-[11px] font-bold uppercase tracking-[0.18em]',
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </p>
  )
}

interface TextAreaProps extends ComponentPropsWithoutRef<'textarea'> {
  invalid?: boolean
}

export function TextArea({ className, invalid = false, ...props }: TextAreaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(
        'w-full resize-none rounded-[var(--radius-md)] border bg-white/90 px-4 py-3 text-sm leading-6 text-[var(--ink)] shadow-inner outline-none transition',
        'placeholder:text-[var(--muted)]/80 focus:border-[var(--accent)] focus:bg-white focus:ring-2 focus:ring-[rgba(73,110,81,0.18)]',
        invalid ? 'border-[var(--danger)]' : 'border-[var(--line)]',
        className,
      )}
      {...props}
    />
  )
}

interface TextInputProps extends ComponentPropsWithoutRef<'input'> {
  invalid?: boolean
}

export function TextInput({ className, invalid = false, ...props }: TextInputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        'h-11 w-full rounded-[var(--radius-md)] border bg-white/90 px-4 text-sm text-[var(--ink)] shadow-inner outline-none transition',
        'placeholder:text-[var(--muted)]/80 focus:border-[var(--accent)] focus:bg-white focus:ring-2 focus:ring-[rgba(73,110,81,0.18)]',
        invalid ? 'border-[var(--danger)]' : 'border-[var(--line)]',
        className,
      )}
      {...props}
    />
  )
}

interface StatusNoticeProps extends ComponentPropsWithoutRef<'div'> {
  tone?: 'info' | 'error' | 'success' | 'loading'
}

export function StatusNotice({
  children,
  className,
  tone = 'info',
  ...props
}: StatusNoticeProps) {
  const tones = {
    error: 'border-[var(--danger)]/35 bg-[var(--danger-soft)] text-[var(--danger)]',
    info: 'border-[var(--sky)]/25 bg-[var(--sky-soft)] text-[#1c5f73]',
    loading: 'border-[var(--line)] bg-white/72 text-[var(--muted-strong)]',
    success: 'border-[var(--success)]/25 bg-[var(--success-soft)] text-[var(--success)]',
  }

  return (
    <div
      className={cn(
        'rounded-[var(--radius-md)] border px-4 py-3 text-sm font-medium leading-6',
        tones[tone],
        className,
      )}
      role={tone === 'error' ? 'alert' : 'status'}
      {...props}
    >
      {children}
    </div>
  )
}

export function SkeletonLines({ count = 3 }: { count?: number }) {
  return (
    <div aria-label="Loading content" className="space-y-2" role="status">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className={cn(
            'h-3 animate-pulse rounded-full bg-[var(--panel-strong)]',
            index % 3 === 0 ? 'w-11/12' : index % 3 === 1 ? 'w-2/3' : 'w-4/5',
          )}
        />
      ))}
    </div>
  )
}
