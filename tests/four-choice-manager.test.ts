// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  FOUR_CHOICE_CATEGORIES,
  type FourChoiceSettings,
} from '../shared/four-choice'
import { FourChoiceManager } from '../server/games/four-choice-manager'
import { RoomError } from '../server/room-manager'

function expectRoomError(action: () => unknown, code: string) {
  try {
    action()
    throw new Error(`Expected ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(RoomError)
    expect((error as RoomError).code).toBe(code)
  }
}

describe('FourChoiceManager', () => {
  it('creates the documented defaults and returns defensive copies', () => {
    const manager = new FourChoiceManager({ now: () => Date.UTC(2026, 8, 18) })
    const setup = manager.ensureSetup('ABCD')

    expect(setup).toMatchObject({
      gameId: 'FOUR_CHOICE',
      settings: {
        mode: 'CLASSIC',
        timePerQuestion: 15,
        questionCount: 20,
        difficulty: 'medium',
      },
    })
    expect(setup.settings.categories).toHaveLength(15)

    setup.settings.categories.length = 0
    expect(manager.getSetup('ABCD').settings.categories).toHaveLength(15)
  })

  it('updates valid settings and permits zero categories while configuring', () => {
    let timestamp = Date.UTC(2026, 8, 18)
    const manager = new FourChoiceManager({ now: () => timestamp })
    const initial = manager.ensureSetup('ABCD')
    timestamp += 1000

    const settings: FourChoiceSettings = {
      ...initial.settings,
      timePerQuestion: 60,
      questionCount: 100,
      difficulty: 'hard',
      categories: [],
    }
    const updated = manager.updateSettings('ABCD', settings)

    expect(updated.settings).toEqual(settings)
    expect(updated.updatedAt).not.toBe(initial.updatedAt)
    expectRoomError(() => manager.validateStart('ABCD'), 'NO_CATEGORIES')

    manager.updateSettings('ABCD', {
      ...settings,
      categories: ['science'],
    })
    expect(manager.validateStart('ABCD').settings.categories).toEqual(['science'])
  })

  it('rejects out-of-range values, unknown categories, and duplicates', () => {
    const manager = new FourChoiceManager()
    const defaults = manager.ensureSetup('ABCD').settings

    const invalidSettings = [
      { ...defaults, timePerQuestion: 4 },
      { ...defaults, timePerQuestion: 16 },
      { ...defaults, questionCount: 0 },
      { ...defaults, questionCount: 21 },
      { ...defaults, difficulty: 'extreme' },
      { ...defaults, categories: ['not-a-category'] },
      { ...defaults, categories: ['science', 'science'] },
    ]

    for (const settings of invalidSettings) {
      expectRoomError(
        () => manager.updateSettings('ABCD', settings as FourChoiceSettings),
        'INVALID_INPUT',
      )
    }

    expect(FOUR_CHOICE_CATEGORIES).toHaveLength(15)
  })

  it('removes setup state when its room closes', () => {
    const manager = new FourChoiceManager()
    manager.ensureSetup('ABCD')
    manager.removeSetup('ABCD')
    expectRoomError(() => manager.getSetup('ABCD'), 'INVALID_GAME_STATE')
  })
})
