// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { BOARD, CLASSIC_SETTINGS, getPropertyBoard, type MatchSnapshot } from '../shared/property-game'
import type { RoomSnapshot } from '../shared/protocol'
import { PropertyGameManager } from '../server/games/property-game-manager'
import { buildingSupply, netWorth, rentFor } from '../server/games/property-rules'
import { RoomError } from '../server/room-manager'

const hostId = 'host-id'
const guestId = 'guest-id'
const room: RoomSnapshot = {
  code: 'ABCD', status: 'GAME_SETUP', selectedGameId: 'property_game', hostId,
  players: [
    { id: hostId, name: 'Host', isConnected: true },
    { id: guestId, name: 'Guest', isConnected: true },
  ],
  settings: { maxPlayers: 8, allowLateJoin: false, filterNames: true },
  createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
}
const activeRoom = { ...room, status: 'PLAYING' as const }

function readyProfiles(manager: PropertyGameManager) {
  manager.setProfile(room, hostId, { avatar: 'robot', colour: 'purple' })
  manager.setProfile(room, hostId, { ready: true })
  manager.setProfile(room, guestId, { avatar: 'frog', colour: 'green' })
  manager.setProfile(room, guestId, { ready: true })
}

function harness(rolls: number[]) {
  let time = 1_000_000
  const sequence = [...rolls]
  const manager = new PropertyGameManager({ now: () => time, die: () => sequence.shift() ?? 1 })
  return {
    manager,
    advance(ms: number) { time += ms; manager.tick(activeRoom) },
    advanceWith(ms: number, currentRoom: RoomSnapshot) { time += ms; manager.tick(currentRoom) },
    begin() { readyProfiles(manager); manager.start(room, hostId); time += 4500; manager.tick(activeRoom) },
  }
}

function liveState(manager: PropertyGameManager): MatchSnapshot {
  return (manager as unknown as { matches: Map<string, { state: MatchSnapshot }> }).matches.get(room.code)!.state
}

describe('Own It! server rules', () => {
  it('has 40 original board spaces and complete property groups', () => {
    expect(BOARD).toHaveLength(40)
    expect(BOARD.map((tile) => tile.index)).toEqual(Array.from({ length: 40 }, (_, index) => index))
    expect(BOARD.filter((tile) => tile.type === 'TRANSPORT')).toHaveLength(4)
    expect(BOARD.filter((tile) => tile.type === 'UTILITY')).toHaveLength(2)
    expect(BOARD.filter((tile) => tile.type === 'PROPERTY')).toHaveLength(22)
  })

  it('keeps setup host-only and validates settings', () => {
    const { manager } = harness([6, 6, 1, 1])
    expect(() => manager.setSettings(room, guestId, CLASSIC_SETTINGS)).toThrow(RoomError)
    expect(() => manager.setSettings(room, hostId, { ...CLASSIC_SETTINGS, startingCash: -1 })).toThrow(RoomError)
    expect(manager.setSettings(room, hostId, { ...CLASSIC_SETTINGS, startingCash: 2000, preset: 'custom' }).startingCash).toBe(2000)
  })

  it('requires each player to choose an Own It! look and ready up', () => {
    const { manager } = harness([6, 6, 1, 1])
    expect(() => manager.start(room, hostId)).toThrow(/Every player must choose/)
    expect(() => manager.setProfile(room, hostId, { ready: true })).toThrow(/Choose both/)
    manager.setProfile(room, hostId, { avatar: 'robot', colour: 'purple' })
    manager.setProfile(room, hostId, { ready: true })
    manager.setProfile(room, guestId, { avatar: 'fox', colour: 'teal' })
    expect(() => manager.start(room, hostId)).toThrow(/Every player must choose/)
    manager.setProfile(room, guestId, { ready: true })
    const started = manager.start(room, hostId)
    expect(started.players[guestId]).toMatchObject({ avatar: 'fox', colour: 'teal' })
    expect(manager.setProfile(room, guestId, { colour: 'gold' }).profiles[guestId].ready).toBe(false)
  })

  it('uses the selected South Africa map for movement and property names', () => {
    const { manager, advance } = harness([6, 6, 1, 1, 1, 2])
    readyProfiles(manager)
    manager.setSettings(room, hostId, { ...CLASSIC_SETTINGS, mapId: 'south_africa', preset: 'custom' })
    manager.start(room, hostId)
    advance(4500)
    const result = manager.act(activeRoom, hostId, { type: 'roll' })
    expect(getPropertyBoard('south_africa')[3].name).toBe('V&A Waterfront')
    expect(result.log.at(-1)?.text).toContain('V&A Waterfront')
    expect(result.settings.mapId).toBe('south_africa')
  })

  it('rolls on the server, buys a property, collects rent, and enforces turn ownership', () => {
    const { manager, begin } = harness([6, 6, 1, 1, 1, 2, 1, 2])
    begin()
    expect(manager.getMatch(room.code)?.order).toEqual([hostId, guestId])
    expect(() => manager.act(activeRoom, guestId, { type: 'roll' })).toThrow(RoomError)
    const landed = manager.act(activeRoom, hostId, { type: 'roll' })
    expect(landed.phase).toBe('PROPERTY_DECISION')
    expect(landed.pendingTile).toBe(3)
    const bought = manager.act(activeRoom, hostId, { type: 'buy' })
    expect(bought.properties[3].ownerId).toBe(hostId)
    expect(bought.players[hostId].cash).toBe(1440)
    manager.act(activeRoom, hostId, { type: 'end_turn' })
    const rent = manager.act(activeRoom, guestId, { type: 'roll' })
    expect(rent.players[guestId].position).toBe(3)
    expect(rent.players[guestId].cash).toBe(1496)
    expect(rent.players[hostId].cash).toBe(1444)
    expect(rent.players[hostId].stats.rentCollected).toBe(4)
  })

  it('allows the decliner to bid and awards the auction to the highest bidder', () => {
    const { manager, begin } = harness([6, 6, 1, 1, 1, 2])
    begin()
    manager.act(activeRoom, hostId, { type: 'roll' })
    expect(manager.act(activeRoom, hostId, { type: 'decline' }).phase).toBe('AUCTION')
    manager.act(activeRoom, guestId, { type: 'auction_bid', amount: 10 })
    manager.act(activeRoom, hostId, { type: 'auction_bid', amount: 20 })
    const result = manager.act(activeRoom, guestId, { type: 'auction_pass' })
    expect(result.phase).toBe('MANAGEMENT')
    expect(result.properties[3].ownerId).toBe(hostId)
    expect(result.players[hostId].cash).toBe(1480)
  })

  it('keeps mortgages free of rent and charges interest to release them', () => {
    const { manager, begin } = harness([6, 6, 1, 1, 1, 2, 1, 2])
    begin()
    manager.act(activeRoom, hostId, { type: 'roll' })
    manager.act(activeRoom, hostId, { type: 'buy' })
    const mortgaged = manager.act(activeRoom, hostId, { type: 'mortgage', tile: 3 })
    expect(mortgaged.players[hostId].cash).toBe(1470)
    expect(mortgaged.properties[3].mortgaged).toBe(true)
    expect(rentFor(mortgaged, BOARD[3], 3)).toBe(0)
    const restored = manager.act(activeRoom, hostId, { type: 'unmortgage', tile: 3 })
    expect(restored.players[hostId].cash).toBe(1437)
    manager.act(activeRoom, hostId, { type: 'end_turn' })
    expect(manager.act(activeRoom, guestId, { type: 'roll' }).players[hostId].cash).toBe(1441)
  })

  it('trades property and cash only after the receiving player accepts', () => {
    const { manager, begin } = harness([6, 6, 1, 1, 1, 2, 1, 2])
    begin()
    manager.act(activeRoom, hostId, { type: 'roll' })
    manager.act(activeRoom, hostId, { type: 'buy' })
    manager.act(activeRoom, hostId, { type: 'end_turn' })
    manager.act(activeRoom, guestId, { type: 'roll' })
    manager.act(activeRoom, guestId, { type: 'end_turn' })
    const offer = manager.act(activeRoom, hostId, { type: 'trade_offer', toId: guestId, give: { cash: 0, properties: [3], jailCards: [] }, receive: { cash: 50, properties: [], jailCards: [] } })
    expect(offer.properties[3].ownerId).toBe(hostId)
    const accepted = manager.act(activeRoom, guestId, { type: 'trade_accept', offerId: offer.trade!.id })
    expect(accepted.properties[3].ownerId).toBe(guestId)
    expect(accepted.players[hostId].cash).toBe(1494)
    expect(accepted.players[guestId].cash).toBe(1446)
    expect(accepted.players[hostId].stats.trades).toBe(1)
  })

  it('sends a player to jail without moving on the third consecutive doubles', () => {
    const { manager, begin } = harness([6, 6, 1, 1, 2, 2, 2, 2, 2, 2])
    manager.setSettings(room, hostId, { ...CLASSIC_SETTINGS, auctions: false, preset: 'custom' })
    begin()
    manager.act(activeRoom, hostId, { type: 'roll' }) // 4: city tax
    manager.act(activeRoom, hostId, { type: 'end_turn' })
    manager.act(activeRoom, hostId, { type: 'roll' }) // 8: property
    manager.act(activeRoom, hostId, { type: 'decline' })
    manager.act(activeRoom, hostId, { type: 'end_turn' })
    const jailed = manager.act(activeRoom, hostId, { type: 'roll' })
    expect(jailed.players[hostId].position).toBe(10)
    expect(jailed.players[hostId].inJail).toBe(true)
    expect(jailed.doublesCount).toBe(0)
  })

  it('offers debt mode before bankruptcy and declares the other player winner', () => {
    const { manager, begin } = harness([6, 6, 1, 1, 2, 2])
    manager.setSettings(room, hostId, { ...CLASSIC_SETTINGS, startingCash: 500, incomeTax: 1000, preset: 'custom' })
    begin()
    const debt = manager.act(activeRoom, hostId, { type: 'roll' })
    expect(debt.phase).toBe('DEBT')
    expect(debt.debt?.amount).toBe(1000)
    const finished = manager.act(activeRoom, hostId, { type: 'bankrupt' })
    expect(finished.phase).toBe('FINISHED')
    expect(finished.winnerId).toBe(guestId)
  })

  it('calculates set rent, building supply and net worth from state', () => {
    const { manager, begin } = harness([6, 6, 1, 1])
    begin()
    const state = manager.getMatch(room.code) as MatchSnapshot
    state.properties[1].ownerId = hostId
    state.properties[3].ownerId = hostId
    expect(rentFor(state, BOARD[3], 3)).toBe(8)
    state.properties[3].buildings = 2
    expect(rentFor(state, BOARD[3], 3)).toBe(60)
    expect(buildingSupply(state).houses).toBe(30)
    expect(netWorth(state, hostId)).toBe(1500 + 60 + 60 + 100)
  })

  it('restores a paused timer and retains the complete match for reconnection', () => {
    const { manager, begin, advance } = harness([6, 6, 1, 1])
    manager.setSettings(room, hostId, { ...CLASSIC_SETTINGS, turnTimer: 30, preset: 'custom' })
    begin()
    const initial = manager.getMatch(room.code)!
    manager.act(activeRoom, hostId, { type: 'pause' })
    advance(20_000)
    expect(manager.getMatch(room.code)?.phase).toBe('PRE_ROLL')
    manager.act(activeRoom, hostId, { type: 'resume' })
    expect(manager.getMatch(room.code)?.deadline).toBe(initial.deadline! + 20_000)
    expect(manager.getMatch(room.code)?.players[guestId].cash).toBe(1500)
  })

  it('enforces even houses, hotels, limited supply, and developed-group mortgage restrictions', () => {
    const { manager, begin } = harness([6, 6, 1, 1])
    begin()
    const state = liveState(manager)
    state.phase = 'MANAGEMENT'
    state.properties[1].ownerId = hostId
    state.properties[3].ownerId = hostId
    manager.act(activeRoom, hostId, { type: 'build', tile: 1 })
    expect(() => manager.act(activeRoom, hostId, { type: 'build', tile: 1 })).toThrow(RoomError)
    expect(() => manager.act(activeRoom, hostId, { type: 'mortgage', tile: 3 })).toThrow(RoomError)
    manager.act(activeRoom, hostId, { type: 'build', tile: 3 })
    for (let level = 2; level <= 4; level += 1) {
      manager.act(activeRoom, hostId, { type: 'build', tile: 1 })
      manager.act(activeRoom, hostId, { type: 'build', tile: 3 })
    }
    expect(buildingSupply(manager.getMatch(room.code)!).houses).toBe(24)
    const hotel = manager.act(activeRoom, hostId, { type: 'build', tile: 1 })
    expect(hotel.properties[1].buildings).toBe(5)
    expect(buildingSupply(hotel)).toEqual({ houses: 28, hotels: 11 })
    expect(rentFor(hotel, BOARD[1], 7)).toBe(250)
    const secondHotel = manager.act(activeRoom, hostId, { type: 'build', tile: 3 })
    expect(secondHotel.properties[3].buildings).toBe(5)
    const sold = manager.act(activeRoom, hostId, { type: 'sell_building', tile: 1 })
    expect(sold.properties[1].buildings).toBe(4)
  })

  it('lets a debtor mortgage property and automatically settle when cash becomes sufficient', () => {
    const { manager, begin } = harness([6, 6, 1, 1, 1, 1])
    begin()
    const state = liveState(manager)
    state.properties[3].ownerId = hostId
    state.players[hostId].cash = 180
    state.players[hostId].position = 2
    const debt = manager.act(activeRoom, hostId, { type: 'roll' })
    expect(debt.debt?.amount).toBe(200)
    const settled = manager.act(activeRoom, hostId, { type: 'mortgage', tile: 3 })
    expect(settled.debt).toBeNull()
    expect(settled.players[hostId].cash).toBe(10)
    expect(settled.phase).toBe('MANAGEMENT')
  })

  it('holds a disconnected player for 30 seconds and cancels automation on reconnect', () => {
    const { manager, begin, advanceWith } = harness([6, 6, 1, 1, 1, 2])
    manager.setSettings(room, hostId, { ...CLASSIC_SETTINGS, auctions: false, preset: 'custom' })
    begin()
    const offline = { ...activeRoom, players: activeRoom.players.map((player) => player.id === hostId ? { ...player, isConnected: false } : player) }
    manager.tick(offline)
    expect(manager.getMatch(room.code)?.deadline).not.toBeNull()
    advanceWith(20_000, activeRoom)
    expect(manager.getMatch(room.code)?.deadline).toBeNull()
    advanceWith(20_000, activeRoom)
    expect(manager.getMatch(room.code)?.phase).toBe('PRE_ROLL')
    manager.tick(offline)
    advanceWith(30_001, offline)
    expect(manager.getMatch(room.code)?.phase).toBe('PROPERTY_DECISION')
    expect(manager.getMatch(room.code)?.players[hostId].position).toBe(3)
  })

  it('gives a card back to its deck after it is used to leave jail', () => {
    const { manager, begin } = harness([6, 6, 1, 1, 1, 1])
    begin()
    const match = (manager as unknown as { matches: Map<string, { state: MatchSnapshot; decks: { event: string[] } }> }).matches.get(room.code)!
    match.decks.event = ['e11']
    match.state.players[hostId].position = 5
    const drawn = manager.act(activeRoom, hostId, { type: 'roll' })
    expect(drawn.players[hostId].jailCards).toEqual(['e11'])
    match.state.phase = 'PRE_ROLL'
    match.state.players[hostId].inJail = true
    const escaped = manager.act(activeRoom, hostId, { type: 'jail', choice: 'card' })
    expect(escaped.players[hostId].inJail).toBe(false)
    expect(escaped.players[hostId].jailCards).toHaveLength(0)
    expect(match.decks.event).toContain('e11')
  })

  it('uses net worth at the round limit', () => {
    const { manager, begin } = harness([6, 6, 1, 1])
    manager.setSettings(room, hostId, { ...CLASSIC_SETTINGS, endCondition: 'rounds', maxRounds: 10, preset: 'custom' })
    begin()
    const state = liveState(manager)
    state.currentPlayerId = guestId
    state.phase = 'MANAGEMENT'
    state.round = 10
    state.players[guestId].cash = 1700
    const final = manager.act(activeRoom, guestId, { type: 'end_turn' })
    expect(final.phase).toBe('FINISHED')
    expect(final.winnerId).toBe(guestId)
    expect(final.winnerReason).toContain('Round limit')
  })

  it('does not let a trade freeze the match indefinitely', () => {
    const { manager, begin, advance } = harness([6, 6, 1, 1])
    begin()
    const state = liveState(manager)
    state.phase = 'MANAGEMENT'
    const offer = manager.act(activeRoom, hostId, { type: 'trade_offer', toId: guestId, give: { cash: 10, properties: [], jailCards: [] }, receive: { cash: 0, properties: [], jailCards: [] } })
    expect(offer.phase).toBe('TRADE_PENDING')
    expect(() => manager.act(activeRoom, guestId, { type: 'trade_cancel', offerId: offer.trade!.id })).toThrow(RoomError)
    expect(manager.act(activeRoom, hostId, { type: 'trade_cancel', offerId: offer.trade!.id }).phase).toBe('MANAGEMENT')
    manager.act(activeRoom, hostId, { type: 'trade_offer', toId: guestId, give: { cash: 10, properties: [], jailCards: [] }, receive: { cash: 0, properties: [], jailCards: [] } })
    advance(60_001)
    expect(manager.getMatch(room.code)?.trade).toBeNull()
    expect(manager.getMatch(room.code)?.phase).toBe('MANAGEMENT')
  })

  it('pays the configured double reward for landing exactly on Start', () => {
    const { manager, begin } = harness([6, 6, 1, 1, 1, 1])
    manager.setSettings(room, hostId, { ...CLASSIC_SETTINGS, exactStartBonus: true, preset: 'custom' })
    begin()
    liveState(manager).players[hostId].position = 38
    const landed = manager.act(activeRoom, hostId, { type: 'roll' })
    expect(landed.players[hostId].position).toBe(0)
    expect(landed.players[hostId].cash).toBe(1900)
  })

  it('uses owned transport and utility counts while mortgaged tiles themselves charge no rent', () => {
    const { manager, begin } = harness([6, 6, 1, 1])
    begin()
    const state = liveState(manager)
    state.properties[5].ownerId = hostId
    state.properties[15].ownerId = hostId
    state.properties[12].ownerId = hostId
    state.properties[28].ownerId = hostId
    state.properties[28].mortgaged = true
    expect(rentFor(state, BOARD[5], 7)).toBe(50)
    expect(rentFor(state, BOARD[12], 7)).toBe(70)
    state.properties[12].mortgaged = true
    expect(rentFor(state, BOARD[12], 7)).toBe(0)
  })

  it('forces the fine and final movement after three failed jail rolls', () => {
    const { manager, begin } = harness([6, 6, 1, 1, 1, 2, 1, 2, 1, 2])
    begin()
    const state = liveState(manager)
    state.players[hostId].position = 10
    state.players[hostId].inJail = true
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const failed = manager.act(activeRoom, hostId, { type: 'jail', choice: 'roll' })
      expect(failed.players[hostId].inJail).toBe(true)
      state.phase = 'PRE_ROLL'
    }
    const escaped = manager.act(activeRoom, hostId, { type: 'jail', choice: 'roll' })
    expect(escaped.players[hostId].inJail).toBe(false)
    expect(escaped.players[hostId].position).toBe(13)
    expect(escaped.players[hostId].cash).toBe(1450)
  })

  it('transfers deeds to a player creditor after bankruptcy', () => {
    const { manager, begin } = harness([6, 6, 1, 1, 1, 1])
    begin()
    const state = liveState(manager)
    state.players[hostId].cash = 0
    state.players[hostId].position = 1
    state.properties[1].ownerId = hostId
    state.properties[3].ownerId = guestId
    const debt = manager.act(activeRoom, hostId, { type: 'roll' })
    expect(debt.phase).toBe('DEBT')
    const finished = manager.act(activeRoom, hostId, { type: 'bankrupt' })
    expect(finished.properties[1].ownerId).toBe(guestId)
    expect(finished.winnerId).toBe(guestId)
  })

  it('awards the free-parking pot when the house rule is on', () => {
    const { manager, begin } = harness([6, 6, 1, 1, 1, 1])
    manager.setSettings(room, hostId, { ...CLASSIC_SETTINGS, freeParkingBonus: true, freeParkingStartingPot: 300, preset: 'custom' })
    begin()
    liveState(manager).players[hostId].position = 18
    const parked = manager.act(activeRoom, hostId, { type: 'roll' })
    expect(parked.players[hostId].position).toBe(20)
    expect(parked.players[hostId].cash).toBe(1800)
    expect(parked.pot).toBe(0)
  })
})
