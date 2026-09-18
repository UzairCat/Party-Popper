export const FOUR_CHOICE_MODE_IDS = ['CLASSIC'] as const
export const FOUR_CHOICE_DIFFICULTIES = ['easy', 'medium', 'hard'] as const

export const FOUR_CHOICE_TIME_MIN = 5
export const FOUR_CHOICE_TIME_MAX = 60
export const FOUR_CHOICE_TIME_STEP = 5
export const FOUR_CHOICE_QUESTION_MIN = 5
export const FOUR_CHOICE_QUESTION_MAX = 100
export const FOUR_CHOICE_QUESTION_STEP = 5

export const FOUR_CHOICE_CATEGORIES = [
  { id: 'general-knowledge', label: 'General Knowledge', icon: '◆' },
  { id: 'science', label: 'Science', icon: '⚛' },
  { id: 'history', label: 'History', icon: '⌛' },
  { id: 'geography', label: 'Geography', icon: '◎' },
  { id: 'movies-tv', label: 'Movies & TV', icon: '▶' },
  { id: 'gaming', label: 'Gaming', icon: '✦' },
  { id: 'music', label: 'Music', icon: '♪' },
  { id: 'sports', label: 'Sports', icon: '●' },
  { id: 'technology', label: 'Technology', icon: '⌘' },
  { id: 'animals', label: 'Animals', icon: '♣' },
  { id: 'food-drink', label: 'Food & Drink', icon: '◒' },
  { id: 'internet', label: 'Internet', icon: '@' },
  { id: 'mythology', label: 'Mythology', icon: '♜' },
  { id: 'language', label: 'Language', icon: 'Aa' },
  { id: 'pop-culture', label: 'Pop Culture', icon: '★' },
] as const

export type FourChoiceMode = (typeof FOUR_CHOICE_MODE_IDS)[number]
export type FourChoiceDifficulty = (typeof FOUR_CHOICE_DIFFICULTIES)[number]
export type FourChoiceCategoryId = (typeof FOUR_CHOICE_CATEGORIES)[number]['id']

export interface FourChoiceSettings {
  mode: FourChoiceMode
  timePerQuestion: number
  questionCount: number
  difficulty: FourChoiceDifficulty
  categories: FourChoiceCategoryId[]
}

export interface FourChoiceSetupSnapshot {
  gameId: 'FOUR_CHOICE'
  settings: FourChoiceSettings
  updatedAt: string
}

export type QuizPhase = 'GENERATING' | 'ERROR' | 'INTRO' | 'QUESTION_INTRO' | 'QUESTION' | 'ANSWER_REVEAL' | 'LEADERBOARD' | 'FINAL_RESULTS'

export interface QuizStanding {
  playerId: string
  name: string
  avatar: import('./protocol.js').PlayerAvatar
  isConnected: boolean
  score: number
  points: number
  rank: number
  previousRank: number
}

/** Public, personalized state. Future questions and their solutions never travel here. */
export interface QuizSnapshot {
  matchId: string
  phase: QuizPhase
  serverNow: number
  deadline: number | null
  questionNumber: number
  questionCount: number
  timePerQuestion: number
  question: { id: string; text: string; answers: string[]; category: FourChoiceCategoryId } | null
  correctAnswer: number | null
  ownAnswer: number | null
  ownPoints: number | null
  answeredCount: number
  playerCount: number
  standings: QuizStanding[]
  error: string | null
}

export const DEFAULT_FOUR_CHOICE_SETTINGS: FourChoiceSettings = {
  mode: 'CLASSIC',
  timePerQuestion: 15,
  questionCount: 20,
  difficulty: 'medium',
  categories: FOUR_CHOICE_CATEGORIES.map((category) => category.id),
}
