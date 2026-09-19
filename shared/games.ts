export type GameId = string

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
    id: 'property_game',
    name: 'Own It!',
    shortName: 'Own It!',
    description: 'Roll, buy, build and bargain your way to the last fortune standing.',
    type: 'Property strategy',
    minimumPlayers: 2,
    maximumPlayers: 8,
    estimatedDuration: '30–120+ min',
  },
]

export function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && GAME_CATALOG.some((game) => game.id === value)
}
