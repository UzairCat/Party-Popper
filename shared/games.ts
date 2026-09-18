export const GAME_IDS = ['FOUR_CHOICE'] as const

export type GameId = (typeof GAME_IDS)[number]

export interface GameDefinition {
  id: GameId
  name: string
  shortName: string
  description: string
  type: string
  minimumPlayers: number
  maximumPlayers: number
  estimatedDuration: string
}

export const GAME_CATALOG: readonly GameDefinition[] = [
  {
    id: 'FOUR_CHOICE',
    name: 'Four Choice Quiz',
    shortName: 'Four Choice',
    description: 'Pick the right answer. Beat everyone else.',
    type: 'Trivia',
    minimumPlayers: 2,
    maximumPlayers: 12,
    estimatedDuration: '5–30 min',
  },
]

export function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && GAME_IDS.includes(value as GameId)
}
