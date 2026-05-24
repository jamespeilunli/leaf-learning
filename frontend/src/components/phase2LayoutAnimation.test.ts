import { describe, expect, it } from 'vitest'

import {
  alignNodesToAnchor,
  nodeCenter,
  shouldAnimateLayout,
} from './phase2LayoutAnimation'

describe('phase2LayoutAnimation', () => {
  it('only animates after initial layout and when reduced motion is off', () => {
    expect(shouldAnimateLayout(false, false)).toBe(false)
    expect(shouldAnimateLayout(true, true)).toBe(false)
    expect(shouldAnimateLayout(true, false)).toBe(true)
  })

  it('computes node centers and shifts layouts to a stable anchor', () => {
    expect(nodeCenter({ x: 10, y: 20 }, { width: 100, height: 60 })).toEqual({
      x: 60,
      y: 50,
    })

    const shifted = alignNodesToAnchor(
      [
        { id: 'root', position: { x: 30, y: 40 } },
        { id: 'child', position: { x: 90, y: 160 } },
      ],
      { x: 80, y: 70 },
      { x: 50, y: 30 },
    )

    expect(shifted).toEqual([
      { id: 'root', position: { x: 0, y: 0 } },
      { id: 'child', position: { x: 60, y: 120 } },
    ])
  })
})
