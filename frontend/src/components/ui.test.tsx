import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { cn } from '../lib/cn'
import { Button, IconButton, Panel, SkeletonLines, StatusNotice, TextArea } from './ui'

describe('ui primitives', () => {
  it('Button disables itself while loading and keeps an accessible label', () => {
    render(<Button isLoading>Save changes</Button>)

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('IconButton requires an explicit accessible label', () => {
    render(<IconButton label="Close panel">x</IconButton>)

    expect(screen.getByRole('button', { name: 'Close panel' })).toBeInTheDocument()
  })

  it('TextArea reports invalid state for validation feedback', () => {
    render(<TextArea invalid aria-label="Topic" />)

    expect(screen.getByLabelText('Topic')).toHaveAttribute('aria-invalid', 'true')
  })

  it('StatusNotice uses alert semantics for errors and status semantics otherwise', () => {
    render(
      <>
        <StatusNotice tone="error">Failed</StatusNotice>
        <StatusNotice tone="success">Saved</StatusNotice>
      </>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Failed')
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
  })

  it('Panel and SkeletonLines provide reusable surface and loading states', () => {
    render(
      <Panel aria-label="Learning panel">
        <SkeletonLines count={2} />
      </Panel>,
    )

    expect(screen.getByRole('region', { name: 'Learning panel' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading content' })).toBeInTheDocument()
  })

  it('cn composes conditional class names', () => {
    expect(cn('base', false, null, 'active')).toBe('base active')
  })
})
