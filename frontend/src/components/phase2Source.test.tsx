import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSessionStore } from '../store/useSessionStore'
import { makePhase2Session } from '../test/fixtures'
import { resetSessionStore } from '../test/storeTestUtils'
import type { Session } from '../types'
import { Phase2Node } from './Phase2Node'
import { Phase2Sidebar } from './Phase2Sidebar'

vi.mock('reactflow', () => ({
  Handle: () => <span data-testid="handle" />,
  Position: { Top: 'top', Bottom: 'bottom' },
}))

function setStoreSession(session: Session, sessionId = 'session-1') {
  useSessionStore.setState({ sessionId, session })
}

function nodeProps(id: string) {
  return {
    id,
    selected: false,
    type: 'test',
    zIndex: 0,
    isConnectable: true,
    xPos: 0,
    yPos: 0,
    dragHandle: undefined,
    dragging: false,
  }
}

describe('phase 2 source display', () => {
  beforeEach(() => {
    resetSessionStore()
  })

  it('only displays the selected primary source from legacy multi-source data', () => {
    const session = makePhase2Session()
    session.nodes.goal.sources = [
      {
        url: 'https://example.com/best',
        title: 'Best Non-Paywalled Source',
        description: 'The chosen source to scan for prerequisites.',
      },
      {
        url: 'https://example.com/extra',
        title: 'Extra Source',
        description: 'A legacy extra source that should not be displayed.',
      },
    ]
    setStoreSession(session)

    render(<Phase2Node data={{ node: session.nodes.goal }} {...nodeProps('goal')} />)
    expect(screen.getByText('Best Non-Paywalled Source')).toBeInTheDocument()
    expect(screen.queryByText('Extra Source')).not.toBeInTheDocument()

    useSessionStore.getState().openNodeDetails('goal')
    render(<Phase2Sidebar />)
    expect(screen.getByText('Source')).toBeInTheDocument()
    expect(screen.getAllByText('Best Non-Paywalled Source')).toHaveLength(2)
    expect(screen.queryByText('Extra Source')).not.toBeInTheDocument()
  })
})
