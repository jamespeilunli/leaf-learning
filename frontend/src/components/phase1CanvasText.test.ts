import { describe, expect, it } from 'vitest'

import { wrapCanvasText } from './phase1CanvasText'

function makeMeasurer(charWidth = 8) {
  return {
    measureText: (text: string) => ({ width: text.length * charWidth }),
  }
}

describe('wrapCanvasText', () => {
  it('wraps labels within the requested line count', () => {
    expect(wrapCanvasText(makeMeasurer(), 'alpha beta gamma delta', 80, 2)).toEqual([
      'alpha beta',
      'gamma...',
    ])
  })

  it('truncates long words that cannot fit on a line', () => {
    expect(wrapCanvasText(makeMeasurer(), 'supercalifragilistic', 64, 2)).toEqual(['super...'])
  })

  it('normalizes extra whitespace before wrapping', () => {
    expect(wrapCanvasText(makeMeasurer(), '  alpha   beta  ', 120, 2)).toEqual(['alpha beta'])
  })
})
