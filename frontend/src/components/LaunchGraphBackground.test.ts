import { describe, expect, it } from 'vitest'

import { getLaunchGraphOrigin } from './launchGraphBackgroundLayout'

describe('getLaunchGraphOrigin', () => {
  it('centers the launch graph horizontally and shifts it up by a quarter screen', () => {
    expect(getLaunchGraphOrigin(1200, 800)).toEqual({
      x: 600,
      y: 200,
    })
  })
})
