import { describe, expect, it } from 'vitest'

import { makeNode } from '../test/fixtures'
import { getRemovedNodeIds, getRoadmapNodeMotion, toNodeMotionSnapshot } from './phase2NodeMotion'

describe('phase2NodeMotion', () => {
  it('does not animate the first graph snapshot', () => {
    const nodes = [
      makeNode({ id: 'goal', label: 'Goal', phase: '2', node_state: 'expanded' }),
      makeNode({ id: 'prereq', label: 'Prerequisite', phase: '2', node_state: 'grayed' }),
    ]

    const motion = getRoadmapNodeMotion(new Map(), nodes, false)

    expect(motion.get('goal')).toBe('idle')
    expect(motion.get('prereq')).toBe('idle')
  })

  it('marks newly added active nodes as entering', () => {
    const previousNodes = [
      makeNode({ id: 'goal', label: 'Goal', phase: '2', node_state: 'expanded' }),
    ]
    const currentNodes = [
      ...previousNodes,
      makeNode({ id: 'child', label: 'Child', phase: '2', node_state: 'expanded' }),
    ]

    const motion = getRoadmapNodeMotion(toNodeMotionSnapshot(previousNodes), currentNodes, true)

    expect(motion.get('goal')).toBe('idle')
    expect(motion.get('child')).toBe('enter')
  })

  it('marks newly added grayed nodes as inactive entering', () => {
    const previousNodes = [
      makeNode({ id: 'goal', label: 'Goal', phase: '2', node_state: 'expanded' }),
    ]
    const currentNodes = [
      ...previousNodes,
      makeNode({ id: 'prereq', label: 'Prerequisite', phase: '2', node_state: 'grayed' }),
    ]

    const motion = getRoadmapNodeMotion(toNodeMotionSnapshot(previousNodes), currentNodes, true)

    expect(motion.get('goal')).toBe('idle')
    expect(motion.get('prereq')).toBe('inactiveEnter')
  })

  it('marks grayed-to-active transitions as entering', () => {
    const previousNodes = [
      makeNode({ id: 'prereq', label: 'Prerequisite', phase: '2', node_state: 'grayed' }),
    ]
    const currentNodes = [
      makeNode({ id: 'prereq', label: 'Prerequisite', phase: '2', node_state: 'expanded' }),
    ]

    const motion = getRoadmapNodeMotion(toNodeMotionSnapshot(previousNodes), currentNodes, true)

    expect(motion.get('prereq')).toBe('enter')
  })

  it('marks learned transitions and removed node ids', () => {
    const previousNodes = [
      makeNode({ id: 'goal', label: 'Goal', phase: '2', node_state: 'expanded' }),
      makeNode({ id: 'removed', label: 'Removed', phase: '2', node_state: 'grayed' }),
    ]
    const currentNodes = [
      makeNode({ id: 'goal', label: 'Goal', phase: '2', node_state: 'learned' }),
    ]
    const previousSnapshot = toNodeMotionSnapshot(previousNodes)

    const motion = getRoadmapNodeMotion(previousSnapshot, currentNodes, true)

    expect(motion.get('goal')).toBe('learned')
    expect(getRemovedNodeIds(previousSnapshot, currentNodes)).toEqual(['removed'])
  })
})
