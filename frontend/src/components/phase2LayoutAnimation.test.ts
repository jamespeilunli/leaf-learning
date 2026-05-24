import { describe, expect, it } from 'vitest'

import {
  shouldAnimateLayout,
} from './phase2LayoutAnimation'

describe('phase2LayoutAnimation', () => {
  it('only animates after initial layout and when reduced motion is off', () => {
    expect(shouldAnimateLayout(false, false)).toBe(false)
    expect(shouldAnimateLayout(true, true)).toBe(false)
    expect(shouldAnimateLayout(true, false)).toBe(true)
  })
})
