import { BOARD, GROUPS, OWNABLE_TILES, type BoardTile, type MatchSnapshot, type PropertySettings, type RulePreset } from '../../shared/property-game.js'
import { RoomError } from '../room-manager.js'

const ranges: Partial<Record<keyof PropertySettings, [number, number, number]>> = {
  startingCash: [500, 5000, 100], passStartReward: [0, 1000, 50], auctionTimer: [5, 60, 1],
  auctionIncrement: [1, 500, 1], freeParkingStartingPot: [0, 2000, 50], houseSupply: [1, 100, 1],
  hotelSupply: [1, 50, 1], buildingSellPercent: [25, 100, 5], mortgageInterest: [0, 50, 1],
  maxJailTurns: [1, 5, 1], jailFine: [0, 500, 10], turnTimer: [0, 120, 1],
  maxRounds: [10, 100, 1], timeLimitMinutes: [15, 240, 1], incomeTax: [0, 1000, 10], luxuryTax: [0, 1000, 10],
}
const boolFields: (keyof PropertySettings)[] = [
  'exactStartBonus', 'auctions', 'freeParkingBonus', 'trading', 'tradeDevelopedGroups',
  'limitedBuildings', 'collectRentInJail', 'allowDoublesEscape', 'doublesExtraTurn',
  'threeDoublesJail', 'autoEndTurn',
]

export function validatePropertySettings(value: unknown): PropertySettings {
  if (!value || typeof value !== 'object') throw new RoomError('INVALID_INPUT', 'Choose valid game settings.')
  const input = value as Record<string, unknown>
  for (const [field, [min, max, step]] of Object.entries(ranges)) {
    const number = input[field]
    if (typeof number !== 'number' || !Number.isInteger(number) || number < min || number > max || (number - min) % step !== 0) {
      throw new RoomError('INVALID_INPUT', `The ${field} setting is out of range.`)
    }
  }
  if (input.turnTimer !== 0 && ![30, 45, 60, 90, 120].includes(input.turnTimer as number)) {
    throw new RoomError('INVALID_INPUT', 'Choose a supported turn timer.')
  }
  for (const field of boolFields) {
    if (typeof input[field] !== 'boolean') throw new RoomError('INVALID_INPUT', `The ${field} setting is invalid.`)
  }
  const choices: Record<string, string[]> = {
    preset: ['classic', 'quick', 'casual', 'custom'], buildingRule: ['even', 'free'],
    buildingTiming: ['own_turn', 'end_turn', 'any_time'], endCondition: ['last', 'rounds', 'time'],
  }
  for (const [field, options] of Object.entries(choices)) {
    if (!options.includes(input[field] as string)) throw new RoomError('INVALID_INPUT', `The ${field} setting is invalid.`)
  }
  return { ...input } as unknown as PropertySettings
}

export function ownedGroup(state: MatchSnapshot, playerId: string, group: string): boolean {
  const tiles = BOARD.filter((tile) => tile.group === group)
  return tiles.length > 0 && tiles.every((tile) => state.properties[tile.index]?.ownerId === playerId)
}

export function groupTiles(tile: BoardTile): BoardTile[] {
  return tile.group ? BOARD.filter((candidate) => candidate.group === tile.group) : []
}

export function rentFor(state: MatchSnapshot, tile: BoardTile, diceTotal: number): number {
  const holding = state.properties[tile.index]
  if (!holding?.ownerId || holding.mortgaged) return 0
  const owner = state.players[holding.ownerId]
  if (!owner || owner.bankrupt || (owner.inJail && !state.settings.collectRentInJail)) return 0
  if (tile.type === 'PROPERTY') {
    const base = tile.rents?.[holding.buildings] ?? 0
    return holding.buildings === 0 && tile.group && ownedGroup(state, owner.id, tile.group) ? base * 2 : base
  }
  if (tile.type === 'TRANSPORT') {
    const count = BOARD.filter((candidate) => candidate.type === 'TRANSPORT' && state.properties[candidate.index]?.ownerId === owner.id).length
    return tile.rents?.[count - 1] ?? 0
  }
  if (tile.type === 'UTILITY') {
    const count = BOARD.filter((candidate) => candidate.type === 'UTILITY' && state.properties[candidate.index]?.ownerId === owner.id).length
    return diceTotal * (tile.rents?.[count - 1] ?? 0)
  }
  return 0
}

export function buildingSupply(state: MatchSnapshot): { houses: number; hotels: number } {
  let houses = state.settings.houseSupply
  let hotels = state.settings.hotelSupply
  for (const holding of Object.values(state.properties)) {
    if (holding.buildings === 5) hotels -= 1
    else houses -= holding.buildings
  }
  return { houses, hotels }
}

export function netWorth(state: MatchSnapshot, playerId: string): number {
  const player = state.players[playerId]
  if (!player) return 0
  return player.cash + OWNABLE_TILES.reduce((total, tile) => {
    const holding = state.properties[tile.index]
    if (holding?.ownerId !== playerId) return total
    return total + (holding.mortgaged ? tile.mortgage ?? 0 : tile.price ?? 0) + holding.buildings * (tile.buildCost ?? 0)
  }, 0)
}

export function completeSetCount(state: MatchSnapshot, playerId: string): number {
  return GROUPS.filter((group) => ownedGroup(state, playerId, group)).length
}

export function presetFromSettings(value: PropertySettings): RulePreset {
  return value.preset
}
