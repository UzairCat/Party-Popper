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

// Games are registered here as their pack modes are built.
export const GAME_CATALOG: readonly GameDefinition[] = []

export function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && GAME_CATALOG.some((game) => game.id === value)
}
