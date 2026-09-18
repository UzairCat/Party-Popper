import {
  DEFAULT_FOUR_CHOICE_SETTINGS,
  FOUR_CHOICE_CATEGORIES,
  FOUR_CHOICE_DIFFICULTIES,
  FOUR_CHOICE_MODE_IDS,
  FOUR_CHOICE_QUESTION_MAX,
  FOUR_CHOICE_QUESTION_MIN,
  FOUR_CHOICE_QUESTION_STEP,
  FOUR_CHOICE_TIME_MAX,
  FOUR_CHOICE_TIME_MIN,
  FOUR_CHOICE_TIME_STEP,
  type FourChoiceCategoryId,
  type FourChoiceSettings,
  type FourChoiceSetupSnapshot,
} from '../../shared/four-choice.js'
import { RoomError } from '../room-manager.js'

interface StoredFourChoiceSetup {
  settings: FourChoiceSettings
  updatedAt: number
}

interface FourChoiceManagerOptions {
  now?: () => number
}

const categoryIds = new Set<string>(
  FOUR_CHOICE_CATEGORIES.map((category) => category.id),
)

export class FourChoiceManager {
  private readonly setups = new Map<string, StoredFourChoiceSetup>()
  private readonly now: () => number

  constructor(options: FourChoiceManagerOptions = {}) {
    this.now = options.now ?? Date.now
  }

  ensureSetup(roomCode: string): FourChoiceSetupSnapshot {
    const existing = this.setups.get(roomCode)
    if (existing) return this.toSnapshot(existing)

    const setup: StoredFourChoiceSetup = {
      settings: this.cloneSettings(DEFAULT_FOUR_CHOICE_SETTINGS),
      updatedAt: this.now(),
    }
    this.setups.set(roomCode, setup)
    return this.toSnapshot(setup)
  }

  getSetup(roomCode: string): FourChoiceSetupSnapshot {
    const setup = this.setups.get(roomCode)
    if (!setup) {
      throw new RoomError('INVALID_GAME_STATE', 'Four Choice has not been selected yet.')
    }

    return this.toSnapshot(setup)
  }

  updateSettings(
    roomCode: string,
    settings: FourChoiceSettings,
  ): FourChoiceSetupSnapshot {
    const setup = this.setups.get(roomCode)
    if (!setup) {
      throw new RoomError('INVALID_GAME_STATE', 'Four Choice has not been selected yet.')
    }

    setup.settings = this.validateSettings(settings)
    setup.updatedAt = this.now()
    return this.toSnapshot(setup)
  }

  validateStart(roomCode: string): FourChoiceSetupSnapshot {
    const setup = this.getSetup(roomCode)
    this.validateSettings(setup.settings)

    if (setup.settings.categories.length === 0) {
      throw new RoomError('NO_CATEGORIES', 'Select at least one category before starting.')
    }

    return setup
  }

  removeSetup(roomCode: string) {
    this.setups.delete(roomCode)
  }

  private validateSettings(settings: FourChoiceSettings): FourChoiceSettings {
    if (!settings || typeof settings !== 'object') {
      throw new RoomError('INVALID_INPUT', 'Enter valid Four Choice settings.')
    }

    if (!FOUR_CHOICE_MODE_IDS.includes(settings.mode)) {
      throw new RoomError('INVALID_INPUT', 'Choose a supported Four Choice mode.')
    }

    if (
      !Number.isInteger(settings.timePerQuestion) ||
      settings.timePerQuestion < FOUR_CHOICE_TIME_MIN ||
      settings.timePerQuestion > FOUR_CHOICE_TIME_MAX ||
      settings.timePerQuestion % FOUR_CHOICE_TIME_STEP !== 0
    ) {
      throw new RoomError(
        'INVALID_INPUT',
        `Time per question must be ${FOUR_CHOICE_TIME_MIN}–${FOUR_CHOICE_TIME_MAX} seconds in ${FOUR_CHOICE_TIME_STEP}-second steps.`,
      )
    }

    if (
      !Number.isInteger(settings.questionCount) ||
      settings.questionCount < FOUR_CHOICE_QUESTION_MIN ||
      settings.questionCount > FOUR_CHOICE_QUESTION_MAX ||
      settings.questionCount % FOUR_CHOICE_QUESTION_STEP !== 0
    ) {
      throw new RoomError(
        'INVALID_INPUT',
        `Question count must be ${FOUR_CHOICE_QUESTION_MIN}–${FOUR_CHOICE_QUESTION_MAX} in steps of ${FOUR_CHOICE_QUESTION_STEP}.`,
      )
    }

    if (!FOUR_CHOICE_DIFFICULTIES.includes(settings.difficulty)) {
      throw new RoomError('INVALID_INPUT', 'Choose Easy, Medium, or Hard.')
    }

    if (
      !Array.isArray(settings.categories) ||
      settings.categories.some((category) => !categoryIds.has(category))
    ) {
      throw new RoomError('INVALID_INPUT', 'Choose only supported quiz categories.')
    }

    if (new Set(settings.categories).size !== settings.categories.length) {
      throw new RoomError('INVALID_INPUT', 'Each category can only be selected once.')
    }

    return this.cloneSettings(settings)
  }

  private cloneSettings(settings: FourChoiceSettings): FourChoiceSettings {
    return {
      mode: settings.mode,
      timePerQuestion: settings.timePerQuestion,
      questionCount: settings.questionCount,
      difficulty: settings.difficulty,
      categories: [...settings.categories] as FourChoiceCategoryId[],
    }
  }

  private toSnapshot(setup: StoredFourChoiceSetup): FourChoiceSetupSnapshot {
    return {
      gameId: 'FOUR_CHOICE',
      settings: this.cloneSettings(setup.settings),
      updatedAt: new Date(setup.updatedAt).toISOString(),
    }
  }
}
