import { randomInt, randomUUID } from 'node:crypto'
import { CARDS, CLASSIC_SETTINGS, PROPERTY_AVATAR_IDS, PROPERTY_COLOUR_IDS, getOwnableTiles, getPropertyBoard, type AuctionState, type DeckName, type MatchPhase, type MatchPlayer, type MatchSnapshot, type PropertyAction, type PropertyAvatar, type PropertyColour, type PropertyHolding, type PropertyPlayerProfile, type PropertySettings, type PropertySetupSnapshot, type TradeAssets, type TradeOffer } from '../../shared/property-game.js'
import type { RoomSnapshot } from '../../shared/protocol.js'
import { RoomError } from '../room-manager.js'
import { buildingSupply, completeSetCount, groupTiles, netWorth, ownedGroup, rentFor, validatePropertySettings } from './property-rules.js'

interface Payment { payerId: string; creditorId: string | null; amount: number; reason: string }
interface InternalMatch {
  state: MatchSnapshot
  decks: Record<DeckName, string[]>
  payments: Payment[]
  pausedAt: number | null
  savedDeadline: number | null
  savedTurnDeadline: number | null
  auctionResumePhase: MatchPhase
  pendingJailMove: [number, number] | null
  pendingJailRelease: boolean
  disconnectDeadline: number | null
  savedDisconnectDeadline: number | null
  debtDisconnectDeadline: number | null
  autoThisTurn: boolean
}

interface ManagerOptions {
  now?: () => number
  die?: () => number
  onUpdate?: (roomCode: string, state: MatchSnapshot) => void
}

const fail = (message: string): never => { throw new RoomError('INVALID_GAME_STATE', message) }
const shuffle = <T>(values: T[]): T[] => {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1)
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}

export class PropertyGameManager {
  private readonly setups = new Map<string, PropertySettings>()
  private readonly profiles = new Map<string, Record<string, PropertyPlayerProfile>>()
  private readonly matches = new Map<string, InternalMatch>()
  private readonly now: () => number
  private readonly die: () => number
  private readonly onUpdate: (roomCode: string, state: MatchSnapshot) => void

  constructor(options: ManagerOptions = {}) {
    this.now = options.now ?? Date.now
    this.die = options.die ?? (() => randomInt(1, 7))
    this.onUpdate = options.onUpdate ?? (() => undefined)
  }

  getSettings(roomCode: string): PropertySettings {
    return { ...(this.setups.get(roomCode) ?? CLASSIC_SETTINGS) }
  }

  getSetup(room: RoomSnapshot): PropertySetupSnapshot {
    const stored = this.profiles.get(room.code) ?? {}
    const profiles: Record<string, PropertyPlayerProfile> = {}
    for (const player of room.players) profiles[player.id] = { ...(stored[player.id] ?? { avatar: null, colour: null, ready: false }) }
    return { settings: this.getSettings(room.code), profiles }
  }

  setProfile(room: RoomSnapshot, playerId: string, value: { avatar?: PropertyAvatar | null; colour?: PropertyColour | null; ready?: boolean }): PropertySetupSnapshot {
    if (room.status !== 'GAME_SETUP' || room.selectedGameId !== 'property_game') fail('Own It! is not in setup.')
    if (!room.players.some((player) => player.id === playerId)) fail('You are not in this room.')
    if (!value || typeof value !== 'object') fail('Choose a character and colour first.')
    const profiles = this.profiles.get(room.code) ?? {}
    const current = profiles[playerId] ?? { avatar: null, colour: null, ready: false }
    const next = { ...current }
    if (value.avatar !== undefined) {
      if (value.avatar !== null && !PROPERTY_AVATAR_IDS.includes(value.avatar)) fail('Choose a valid Own It! character.')
      next.avatar = value.avatar
      next.ready = false
    }
    if (value.colour !== undefined) {
      if (value.colour !== null && !PROPERTY_COLOUR_IDS.includes(value.colour)) fail('Choose a valid Own It! colour.')
      next.colour = value.colour
      next.ready = false
    }
    if (value.ready !== undefined) {
      if (typeof value.ready !== 'boolean') fail('Choose a valid ready state.')
      if (value.ready && (!next.avatar || !next.colour)) fail('Choose both a character and a colour to ready up.')
      next.ready = value.ready
    }
    profiles[playerId] = next
    this.profiles.set(room.code, profiles)
    return this.getSetup(room)
  }

  setSettings(room: RoomSnapshot, playerId: string, value: unknown): PropertySettings {
    if (room.status !== 'GAME_SETUP' || room.selectedGameId !== 'property_game') fail('Own It! is not in setup.')
    if (room.hostId !== playerId) throw new RoomError('HOST_ONLY', 'Only the host can change game rules.')
    const settings = validatePropertySettings(value)
    this.setups.set(room.code, settings)
    return this.getSettings(room.code)
  }

  getMatch(roomCode: string): MatchSnapshot | null {
    const match = this.matches.get(roomCode)
    return match ? structuredClone(match.state) : null
  }

  clear(roomCode: string): void {
    this.matches.delete(roomCode)
    this.setups.delete(roomCode)
    this.profiles.delete(roomCode)
  }

  stopMatch(roomCode: string): void {
    this.matches.delete(roomCode)
  }

  private board(match: InternalMatch) { return getPropertyBoard(match.state.settings.mapId) }
  private ownable(match: InternalMatch) { return getOwnableTiles(match.state.settings.mapId) }

  start(room: RoomSnapshot, playerId: string): MatchSnapshot {
    if (room.hostId !== playerId) throw new RoomError('HOST_ONLY', 'Only the host can start Own It!.')
    if (room.selectedGameId !== 'property_game' || !['GAME_SETUP', 'PLAYING'].includes(room.status)) fail('Select Own It! first.')
    if (room.status === 'PLAYING' && this.matches.get(room.code)?.state.phase !== 'FINISHED') fail('The match is already running.')
    const connected = room.players.filter((player) => player.isConnected)
    if (connected.length !== room.players.length) fail('Wait for disconnected players or remove them before starting.')
    if (connected.length < 2) throw new RoomError('MIN_PLAYERS', 'Own It! needs at least two players.')
    if (connected.length > 8) throw new RoomError('ROOM_FULL', 'Own It! supports up to eight players.')
    const settings = this.getSettings(room.code)
    const setup = this.getSetup(room)
    if (connected.some((player) => !setup.profiles[player.id]?.ready || !setup.profiles[player.id]?.avatar || !setup.profiles[player.id]?.colour)) fail('Every player must choose a character and colour, then ready up.')
    const rolls: Record<string, number> = {}
    const order = connected.map((player) => player.id)
    for (const id of order) rolls[id] = this.die() + this.die()
    // Resolve ties within tied groups only, preserving the original higher rolls.
    const tieScores: Record<string, number[]> = Object.fromEntries(order.map((id) => [id, [rolls[id]]]))
    for (let depth = 1; depth < 12; depth += 1) {
      const ties = order.filter((id) => order.some((other) => other !== id && tieScores[other].join(',') === tieScores[id].join(',')))
      if (!ties.length) break
      for (const id of ties) tieScores[id].push(this.die() + this.die())
    }
    order.sort((a, b) => {
      const left = tieScores[a]
      const right = tieScores[b]
      for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        if ((left[index] ?? 0) !== (right[index] ?? 0)) return (right[index] ?? 0) - (left[index] ?? 0)
      }
      return a.localeCompare(b)
    })
    const players: Record<string, MatchPlayer> = {}
    for (const player of connected) players[player.id] = {
      id: player.id, name: player.name, avatar: setup.profiles[player.id].avatar!, colour: setup.profiles[player.id].colour!, cash: settings.startingCash, position: 0, inJail: false, jailTurns: 0,
      jailCards: [], bankrupt: false, afkTurns: 0,
      stats: { purchased: 0, rentPaid: 0, rentCollected: 0, housesBuilt: 0, hotelsBuilt: 0, trades: 0, jailed: 0, distance: 0 },
    }
    const properties: Record<number, PropertyHolding> = {}
    for (const tile of getOwnableTiles(settings.mapId)) properties[tile.index] = { ownerId: null, buildings: 0, mortgaged: false }
    const now = this.now()
    const state: MatchSnapshot = {
      status: 'ACTIVE', phase: 'INTRO', paused: false, settings, players, properties, order,
      currentPlayerId: order[0], round: 1, turnNumber: 1, turnOrderRolls: rolls,
      startedAt: now, endsAt: settings.endCondition === 'time' ? now + settings.timeLimitMinutes * 60_000 : null,
      deadline: now + 4500, pot: settings.freeParkingBonus ? settings.freeParkingStartingPot : 0,
      dice: null, doublesCount: 0, lastRollAt: null, pendingTile: null, auction: null, trade: null, debt: null,
      lastCard: null, lastCardPlayerId: null, lastCardAt: null, lastMove: null, log: [], winnerId: null, winnerReason: null,
    }
    const match: InternalMatch = {
      state,
      decks: { event: shuffle(CARDS.filter((card) => card.deck === 'event').map((card) => card.id)), community: shuffle(CARDS.filter((card) => card.deck === 'community').map((card) => card.id)) },
      payments: [], pausedAt: null, savedDeadline: null, savedTurnDeadline: null,
      auctionResumePhase: 'MANAGEMENT', pendingJailMove: null, pendingJailRelease: false,
      disconnectDeadline: null, savedDisconnectDeadline: null, debtDisconnectDeadline: null,
      autoThisTurn: false,
    }
    this.matches.set(room.code, match)
    this.log(match, `Turn order set: ${order.map((id) => room.players.find((player) => player.id === id)?.name ?? 'Player').join(' → ')}.`)
    return this.publish(room.code, match)
  }

  act(room: RoomSnapshot, playerId: string, action: PropertyAction): MatchSnapshot {
    const match = this.requireMatch(room.code)
    const state = match.state
    if (room.status !== 'PLAYING' || room.selectedGameId !== 'property_game') fail('Own It! is not active.')
    if (!state.players[playerId]) throw new RoomError('PLAYER_NOT_FOUND', 'You are not in this match.')
    if (action.type === 'pause' || action.type === 'resume' || action.type === 'end_game') {
      if (room.hostId !== playerId) throw new RoomError('HOST_ONLY', 'Only the host can control the match.')
      if (action.type === 'pause') this.pause(match)
      if (action.type === 'resume') this.resume(match)
      if (action.type === 'end_game') this.finishByWorth(match, 'The host ended the game early.')
      return this.publish(room.code, match)
    }
    if (state.paused) fail('The game is paused.')
    if (state.phase === 'FINISHED') fail('The match has ended.')
    if (state.phase === 'INTRO') fail('Wait for the game to begin.')
    if (state.players[playerId].bankrupt) fail('Bankrupt players can only watch.')
    if (playerId === state.currentPlayerId && match.disconnectDeadline !== null) {
      state.deadline = match.savedDisconnectDeadline === null ? null : this.now() + match.savedDisconnectDeadline
      match.disconnectDeadline = null
      match.savedDisconnectDeadline = null
    }

    if (action.type === 'trade_accept' || action.type === 'trade_decline' || action.type === 'trade_counter' || action.type === 'trade_cancel') {
      this.respondToTrade(match, playerId, action)
      return this.publish(room.code, match)
    }
    if (action.type === 'auction_bid' || action.type === 'auction_pass') {
      this.auctionAction(match, playerId, action)
      return this.publish(room.code, match)
    }
    if (action.type === 'trade_offer') {
      this.proposeTrade(match, playerId, action)
      return this.publish(room.code, match)
    }
    if ((action.type === 'build' || action.type === 'sell_building') && state.settings.buildingTiming === 'any_time' && playerId !== state.currentPlayerId) {
      this.manageProperty(match, playerId, action)
      return this.publish(room.code, match)
    }
    if (playerId !== state.currentPlayerId && !(state.phase === 'DEBT' && state.debt?.playerId === playerId)) fail('It is not your turn.')
    state.players[playerId].afkTurns = 0
    match.autoThisTurn = false

    switch (action.type) {
      case 'roll':
        if (state.phase !== 'PRE_ROLL' || state.players[playerId].inJail) fail('You cannot roll right now.')
        this.roll(match, playerId)
        break
      case 'jail':
        if (state.phase !== 'PRE_ROLL' || !state.players[playerId].inJail) fail('You are not in jail.')
        this.jailAction(match, playerId, action.choice)
        break
      case 'buy':
      case 'decline':
        if (state.phase !== 'PROPERTY_DECISION' || state.pendingTile === null) fail('There is no property decision.')
        this.propertyDecision(match, playerId, action.type)
        break
      case 'end_turn':
        if (state.phase !== 'MANAGEMENT') fail('Resolve the current action first.')
        this.endTurn(match)
        break
      case 'build':
      case 'sell_building':
      case 'mortgage':
      case 'unmortgage':
        this.manageProperty(match, playerId, action)
        break
      case 'pay_debt':
        if (state.phase !== 'DEBT' || state.debt?.playerId !== playerId) fail('There is no debt to pay.')
        this.settleDebt(match)
        break
      case 'bankrupt':
        if (state.phase !== 'DEBT' || state.debt?.playerId !== playerId) throw new RoomError('INVALID_GAME_STATE', 'You can only declare bankruptcy while in debt.')
        if (state.players[playerId].cash >= state.debt.amount) fail('You can pay this debt. Use Pay Debt instead.')
        this.bankrupt(match, playerId, state.debt.creditorId)
        break
      default:
        fail('That action is unavailable.')
    }
    return this.publish(room.code, match)
  }

  tick(room: RoomSnapshot): MatchSnapshot | null {
    const match = this.matches.get(room.code)
    if (!match || match.state.paused || match.state.phase === 'FINISHED') return null
    const state = match.state
    const now = this.now()
    if (state.phase === 'INTRO' && state.deadline !== null && now >= state.deadline) {
      this.setPhase(match, 'PRE_ROLL')
      return this.publish(room.code, match)
    }
    if (state.phase === 'AUCTION' && state.auction && now >= state.auction.endsAt) {
      this.finishAuction(match)
      return this.publish(room.code, match)
    }
    if (state.phase === 'TRADE_PENDING' && state.trade) {
      const recipient = room.players.find((player) => player.id === state.trade?.toId)
      if (!recipient?.isConnected && state.deadline !== null && state.deadline > now + 30_000) state.deadline = now + 30_000
      if (state.deadline !== null && now >= state.deadline) {
        this.declineTrade(match)
        return this.publish(room.code, match)
      }
      return null
    }
    if (state.phase === 'DEBT' && state.debt) {
      const debtor = room.players.find((player) => player.id === state.debt?.playerId)
      if (debtor?.isConnected) match.debtDisconnectDeadline = null
      else {
        match.debtDisconnectDeadline ??= now + 30_000
        if (now >= match.debtDisconnectDeadline) {
          match.debtDisconnectDeadline = null
          this.autoResolveDebt(match)
          return this.publish(room.code, match)
        }
      }
      return null
    }
    const active = room.players.find((player) => player.id === state.currentPlayerId)
    if (active && !active.isConnected && ['PRE_ROLL', 'PROPERTY_DECISION', 'MANAGEMENT'].includes(state.phase)) {
      if (match.disconnectDeadline === null) {
        match.savedDisconnectDeadline = state.deadline === null ? null : Math.max(0, state.deadline - now)
        match.disconnectDeadline = now + 30_000
        state.deadline = match.disconnectDeadline
        return this.publish(room.code, match)
      }
    } else if (match.disconnectDeadline !== null) {
      match.disconnectDeadline = null
      state.deadline = match.savedDisconnectDeadline === null ? null : now + match.savedDisconnectDeadline
      match.savedDisconnectDeadline = null
      return this.publish(room.code, match)
    }
    if (state.deadline === null || now < state.deadline) return null
    match.disconnectDeadline = null
    match.savedDisconnectDeadline = null
    match.autoThisTurn = true
    if (state.phase === 'PRE_ROLL') {
      if (state.players[state.currentPlayerId].inJail) this.jailAction(match, state.currentPlayerId, 'roll')
      else this.roll(match, state.currentPlayerId)
    } else if (state.phase === 'PROPERTY_DECISION') {
      this.propertyDecision(match, state.currentPlayerId, 'decline')
    } else if (state.phase === 'MANAGEMENT') {
      this.endTurn(match)
    }
    return this.publish(room.code, match)
  }

  private requireMatch(code: string): InternalMatch {
    return this.matches.get(code) ?? fail('This match is no longer available.')
  }

  private publish(code: string, match: InternalMatch): MatchSnapshot {
    const snapshot = structuredClone(match.state)
    this.onUpdate(code, snapshot)
    return snapshot
  }

  private log(match: InternalMatch, text: string): void {
    const entries = match.state.log
    entries.push({ id: (entries.at(-1)?.id ?? 0) + 1, at: this.now(), text })
    if (entries.length > 80) entries.shift()
  }

  private name(match: InternalMatch, id: string): string { return match.state.players[id]?.name ?? 'Player' }

  private setPhase(match: InternalMatch, phase: MatchPhase, restore = false): void {
    const state = match.state
    state.phase = phase
    const seconds = state.settings.turnTimer
    if (phase === 'PRE_ROLL' || phase === 'PROPERTY_DECISION' || phase === 'MANAGEMENT') {
      state.deadline = restore && match.savedTurnDeadline !== null
        ? this.now() + match.savedTurnDeadline
        : phase === 'MANAGEMENT' && state.settings.autoEndTurn ? this.now() + 5000
          : seconds ? this.now() + seconds * 1000 : null
      match.savedTurnDeadline = null
    } else if (phase !== 'AUCTION' && phase !== 'INTRO') {
      state.deadline = null
    }
  }

  private suspendTurnDeadline(match: InternalMatch): void {
    match.savedTurnDeadline = match.state.deadline === null ? null : Math.max(0, match.state.deadline - this.now())
  }

  private pause(match: InternalMatch): void {
    if (match.state.paused || match.state.phase === 'FINISHED') fail('The game is already paused or finished.')
    match.pausedAt = this.now()
    match.state.paused = true
    this.log(match, 'The host paused the game.')
  }

  private resume(match: InternalMatch): void {
    if (!match.state.paused || match.pausedAt === null) throw new RoomError('INVALID_GAME_STATE', 'The game is not paused.')
    const elapsed = this.now() - match.pausedAt
    if (match.state.deadline !== null) match.state.deadline += elapsed
    if (match.state.auction) match.state.auction.endsAt += elapsed
    if (match.state.endsAt !== null) match.state.endsAt += elapsed
    match.pausedAt = null
    match.state.paused = false
    this.log(match, 'The host resumed the game.')
  }

  private roll(match: InternalMatch, playerId: string): void {
    const state = match.state
    const dice: [number, number] = [this.die(), this.die()]
    state.dice = dice
    state.lastRollAt = Math.max(this.now(), (state.lastRollAt ?? 0) + 1)
    state.lastCard = null
    state.lastCardPlayerId = null
    state.lastCardAt = null
    state.players[playerId].lastRoll = dice
    const total = dice[0] + dice[1]
    const doubles = dice[0] === dice[1]
    state.doublesCount = doubles && state.settings.doublesExtraTurn ? state.doublesCount + 1 : 0
    this.log(match, `${this.name(match, playerId)} rolled ${dice[0]} + ${dice[1]}${doubles ? ' — doubles!' : '.'}`)
    if (state.settings.threeDoublesJail && state.doublesCount >= 3) {
      this.goToJail(match, playerId, 'Three doubles in a row')
      return
    }
    this.moveBy(match, playerId, total, total)
  }

  private moveBy(match: InternalMatch, playerId: string, amount: number, diceTotal: number): void {
    const state = match.state
    const player = state.players[playerId]
    const from = player.position
    const raw = from + amount
    const boardLength = this.board(match).length
    const to = ((raw % boardLength) + boardLength) % boardLength
    player.position = to
    player.stats.distance += Math.abs(amount)
    state.lastMove = { playerId, from, steps: amount, to, at: this.now() }
    if (amount > 0 && raw >= boardLength) {
      const award = state.settings.passStartReward * (to === 0 && state.settings.exactStartBonus ? 2 : 1)
      player.cash += award
      this.log(match, `${this.name(match, playerId)} passed Start and collected $${award}.`)
    }
    this.land(match, playerId, diceTotal)
    if (state.deadline !== null && ['PROPERTY_DECISION', 'MANAGEMENT'].includes(state.phase)) state.deadline += Math.min(5000, Math.abs(amount) * 120 + 400)
  }

  private moveTo(match: InternalMatch, playerId: string, target: number, collectStart: boolean, diceTotal: number): void {
    const state = match.state
    const from = state.players[playerId].position
    const steps = (target - from + this.board(match).length) % this.board(match).length
    state.players[playerId].position = target
    state.players[playerId].stats.distance += steps
    state.lastMove = { playerId, from, steps, to: target, at: this.now() }
    if (collectStart && (target <= from || target === 0)) {
      const award = state.settings.passStartReward * (target === 0 && state.settings.exactStartBonus ? 2 : 1)
      state.players[playerId].cash += award
      this.log(match, `${this.name(match, playerId)} collected $${award} at Start.`)
    }
    this.land(match, playerId, diceTotal)
    if (state.deadline !== null && ['PROPERTY_DECISION', 'MANAGEMENT'].includes(state.phase)) state.deadline += Math.min(5000, steps * 120 + 400)
  }

  private land(match: InternalMatch, playerId: string, diceTotal: number): void {
    const state = match.state
    const player = state.players[playerId]
    const tile = this.board(match)[player.position]
    state.pendingTile = null
    this.log(match, `${this.name(match, playerId)} landed on ${tile.name}.`)
    if (tile.price !== undefined) {
      const holding = state.properties[tile.index]
      if (!holding.ownerId) {
        state.pendingTile = tile.index
        this.setPhase(match, 'PROPERTY_DECISION')
        return
      }
      if (holding.ownerId !== playerId) {
        const rent = rentFor(state, tile, diceTotal)
        if (rent > 0) {
          this.enqueuePayments(match, [{ payerId: playerId, creditorId: holding.ownerId, amount: rent, reason: `rent on ${tile.name}` }])
          return
        }
      }
    } else if (tile.type === 'TAX') {
      const amount = tile.index === 4 ? state.settings.incomeTax : state.settings.luxuryTax
      this.enqueuePayments(match, [{ payerId: playerId, creditorId: null, amount, reason: tile.name }])
      return
    } else if (tile.type === 'CARD' && tile.deck) {
      this.drawCard(match, playerId, tile.deck, diceTotal)
      return
    } else if (tile.type === 'GO_TO_JAIL') {
      this.goToJail(match, playerId, 'Go to Jail space')
      return
    } else if (tile.type === 'FREE' && state.settings.freeParkingBonus && state.pot > 0) {
      const winnings = state.pot
      player.cash += winnings
      state.pot = 0
      this.log(match, `${this.name(match, playerId)} collected the $${winnings} Free Parking pot.`)
    }
    this.setPhase(match, 'MANAGEMENT')
  }

  private propertyDecision(match: InternalMatch, playerId: string, choice: 'buy' | 'decline'): void {
    const state = match.state
    const index = state.pendingTile
    if (index === null) throw new RoomError('INVALID_GAME_STATE', 'No property is available.')
    const tile = this.board(match)[index]
    const holding = state.properties[index]
    if (holding.ownerId) fail('That property has already been sold.')
    state.pendingTile = null
    if (choice === 'buy') {
      if (state.players[playerId].cash < (tile.price ?? 0)) fail('Not enough cash. Pass or raise funds first.')
      state.players[playerId].cash -= tile.price ?? 0
      holding.ownerId = playerId
      state.players[playerId].stats.purchased += 1
      this.log(match, `${this.name(match, playerId)} bought ${tile.name} for $${tile.price}.`)
      if (tile.group && ownedGroup(state, playerId, tile.group)) this.log(match, `${this.name(match, playerId)} completed the ${tile.group} set!`)
      this.setPhase(match, 'MANAGEMENT')
      return
    }
    this.log(match, `${this.name(match, playerId)} passed on ${tile.name}.`)
    if (state.settings.auctions) this.startAuction(match, index, [], 'MANAGEMENT')
    else this.setPhase(match, 'MANAGEMENT')
  }

  private enqueuePayments(match: InternalMatch, payments: Payment[]): void {
    match.payments.push(...payments.filter((payment) => payment.amount > 0 && payment.payerId !== payment.creditorId))
    this.processPayments(match)
  }

  private processPayments(match: InternalMatch): void {
    const state = match.state
    while (match.payments.length && !state.debt && state.phase !== 'FINISHED') {
      const payment = match.payments.shift()!
      const payer = state.players[payment.payerId]
      const creditor = payment.creditorId ? state.players[payment.creditorId] : null
      if (!payer || payer.bankrupt || (creditor && creditor.bankrupt)) continue
      if (payer.cash < payment.amount) {
        state.debt = { playerId: payment.payerId, creditorId: payment.creditorId, amount: payment.amount, reason: payment.reason, resumePhase: 'MANAGEMENT' }
        this.setPhase(match, 'DEBT')
        this.log(match, `${this.name(match, payment.payerId)} owes $${payment.amount} for ${payment.reason}.`)
        return
      }
      payer.cash -= payment.amount
      if (creditor) {
        creditor.cash += payment.amount
        if (payment.reason.startsWith('rent')) {
          payer.stats.rentPaid += payment.amount
          creditor.stats.rentCollected += payment.amount
        }
      } else if (state.settings.freeParkingBonus) state.pot += payment.amount
      this.log(match, `${this.name(match, payment.payerId)} paid $${payment.amount}${creditor ? ` to ${this.name(match, creditor.id)}` : ' to the bank'} (${payment.reason}).`)
    }
    if (!state.debt && state.phase !== 'FINISHED') this.setPhase(match, 'MANAGEMENT')
  }

  private settleDebt(match: InternalMatch): void {
    const state = match.state
    const debt = state.debt
    if (!debt) return
    const payer = state.players[debt.playerId]
    if (payer.cash < debt.amount) fail(`You still need $${debt.amount - payer.cash}. Sell buildings, mortgage, or trade.`)
    state.debt = null
    match.payments.unshift({ payerId: debt.playerId, creditorId: debt.creditorId, amount: debt.amount, reason: debt.reason })
    this.processPayments(match)
    if (!state.debt && match.pendingJailMove) {
      const dice = match.pendingJailMove
      match.pendingJailMove = null
      payer.inJail = false
      payer.jailTurns = 0
      this.moveBy(match, payer.id, dice[0] + dice[1], dice[0] + dice[1])
    } else if (!state.debt && match.pendingJailRelease) {
      match.pendingJailRelease = false
      payer.inJail = false
      payer.jailTurns = 0
      this.setPhase(match, 'PRE_ROLL')
    }
  }

  private autoResolveDebt(match: InternalMatch): void {
    const state = match.state
    const debtorId = state.debt?.playerId
    if (!debtorId) return
    this.log(match, `${this.name(match, debtorId)} is away. The bank is liquidating assets to cover the debt.`)
    for (let attempt = 0; attempt < 80 && state.debt; attempt += 1) {
      const developed = this.ownable(match).filter((item) => state.properties[item.index].ownerId === debtorId && state.properties[item.index].buildings > 0)
        .sort((a, b) => state.properties[b.index].buildings - state.properties[a.index].buildings)
      let sold = false
      for (const tile of developed) {
        try { this.manageProperty(match, debtorId, { type: 'sell_building', tile: tile.index }); sold = true; break }
        catch { continue }
      }
      if (!sold) break
    }
    for (const tile of this.ownable(match)) {
      if (!state.debt) break
      if (state.properties[tile.index].ownerId !== debtorId || state.properties[tile.index].mortgaged) continue
      try { this.manageProperty(match, debtorId, { type: 'mortgage', tile: tile.index }) }
      catch { continue }
    }
    if (!state.debt) return
    if (state.players[debtorId].cash >= state.debt.amount) this.settleDebt(match)
    else this.bankrupt(match, debtorId, state.debt.creditorId)
  }

  private drawCard(match: InternalMatch, playerId: string, deck: DeckName, diceTotal: number): void {
    const cards = match.decks[deck]
    const cardId = cards.shift()
    if (!cardId) { this.setPhase(match, 'MANAGEMENT'); return }
    const sourceCard = CARDS.find((candidate) => candidate.id === cardId)!
    const card = sourceCard.id === 'e3' ? { ...sourceCard, text: `Move to ${this.board(match)[24].name}. Collect Start if you pass it.` } : sourceCard
    match.state.lastCard = card
    match.state.lastCardPlayerId = playerId
    match.state.lastCardAt = this.now()
    if (card.effect.type !== 'GET_OUT_OF_JAIL') cards.push(cardId)
    this.log(match, `${this.name(match, playerId)} drew ${deck === 'event' ? 'Chance' : 'Community Chest'}: ${card.text}`)
    const effect = card.effect
    switch (effect.type) {
      case 'GAIN_MONEY': match.state.players[playerId].cash += effect.amount; break
      case 'LOSE_MONEY': this.enqueuePayments(match, [{ payerId: playerId, creditorId: null, amount: effect.amount, reason: 'card' }]); return
      case 'MOVE_TO': this.moveTo(match, playerId, effect.target, Boolean(effect.collectStart), diceTotal); return
      case 'MOVE_BY': this.moveBy(match, playerId, effect.amount, diceTotal); return
      case 'GO_TO_JAIL': this.goToJail(match, playerId, 'card'); return
      case 'GET_OUT_OF_JAIL': match.state.players[playerId].jailCards.push(card.id); break
      case 'COLLECT_EACH':
        this.enqueuePayments(match, match.state.order.filter((id) => id !== playerId && !match.state.players[id].bankrupt).map((id) => ({ payerId: id, creditorId: playerId, amount: effect.amount, reason: 'card' })))
        return
      case 'PAY_EACH':
        this.enqueuePayments(match, match.state.order.filter((id) => id !== playerId && !match.state.players[id].bankrupt).map((id) => ({ payerId: playerId, creditorId: id, amount: effect.amount, reason: 'card' })))
        return
      case 'REPAIRS': {
        const holdings = this.ownable(match).filter((tile) => match.state.properties[tile.index].ownerId === playerId)
        const cost = holdings.reduce((total, tile) => {
          const buildings = match.state.properties[tile.index].buildings
          return total + (buildings === 5 ? effect.hotel : buildings * effect.house)
        }, 0)
        this.enqueuePayments(match, [{ payerId: playerId, creditorId: null, amount: cost, reason: 'property repairs' }])
        return
      }
      case 'NEAREST': {
        const from = match.state.players[playerId].position
        const board = this.board(match)
        const tile = [...board.slice(from + 1), ...board.slice(0, from + 1)].find((candidate) => candidate.type === effect.tileType)
        if (tile) this.moveTo(match, playerId, tile.index, true, diceTotal)
        return
      }
    }
    this.setPhase(match, 'MANAGEMENT')
  }

  private goToJail(match: InternalMatch, playerId: string, reason: string): void {
    const player = match.state.players[playerId]
    player.position = 10
    player.inJail = true
    player.jailTurns = 0
    player.stats.jailed += 1
    match.state.doublesCount = 0
    match.state.pendingTile = null
    match.state.lastMove = { playerId, from: match.state.lastMove?.to ?? 30, steps: 0, to: 10, at: this.now() }
    this.log(match, `${this.name(match, playerId)} went to Jail (${reason}).`)
    this.setPhase(match, 'MANAGEMENT')
  }

  private jailAction(match: InternalMatch, playerId: string, choice: 'pay' | 'roll' | 'card'): void {
    const state = match.state
    const player = state.players[playerId]
    if (!['pay', 'roll', 'card'].includes(choice)) throw new RoomError('INVALID_INPUT', 'Choose a valid jail action.')
    if (choice === 'card') {
      const cardId = player.jailCards.shift()
      if (!cardId) throw new RoomError('INVALID_GAME_STATE', 'You do not have a Get Out of Jail card.')
      const card = CARDS.find((item) => item.id === cardId)!
      match.decks[card.deck].push(cardId)
      player.inJail = false
      player.jailTurns = 0
      this.log(match, `${this.name(match, playerId)} used a Get Out of Jail card.`)
      this.setPhase(match, 'PRE_ROLL')
      return
    }
    if (choice === 'pay') {
      this.enqueuePayments(match, [{ payerId: playerId, creditorId: null, amount: state.settings.jailFine, reason: 'jail fine' }])
      if (state.debt) { match.pendingJailRelease = true; return }
      player.inJail = false
      player.jailTurns = 0
      this.setPhase(match, 'PRE_ROLL')
      return
    }
    if (!state.settings.allowDoublesEscape) fail('Rolling doubles to escape is disabled.')
    const dice: [number, number] = [this.die(), this.die()]
    state.dice = dice
    state.lastRollAt = Math.max(this.now(), (state.lastRollAt ?? 0) + 1)
    state.lastCard = null
    state.lastCardPlayerId = null
    state.lastCardAt = null
    player.lastRoll = dice
    this.log(match, `${this.name(match, playerId)} rolled ${dice[0]} + ${dice[1]} in Jail.`)
    if (dice[0] === dice[1]) {
      player.inJail = false
      player.jailTurns = 0
      state.doublesCount = 0
      this.moveBy(match, playerId, dice[0] + dice[1], dice[0] + dice[1])
      return
    }
    player.jailTurns += 1
    if (player.jailTurns >= state.settings.maxJailTurns) {
      this.enqueuePayments(match, [{ payerId: playerId, creditorId: null, amount: state.settings.jailFine, reason: 'jail fine' }])
      if (state.debt) { match.pendingJailMove = dice; return }
      player.inJail = false
      player.jailTurns = 0
      this.moveBy(match, playerId, dice[0] + dice[1], dice[0] + dice[1])
      return
    }
    this.log(match, `${this.name(match, playerId)} stays in Jail (${player.jailTurns}/${state.settings.maxJailTurns}).`)
    this.setPhase(match, 'MANAGEMENT')
  }

  private startAuction(match: InternalMatch, tile: number, bankQueue: number[], resumePhase: MatchPhase): void {
    const state = match.state
    if (state.phase !== 'AUCTION') this.suspendTurnDeadline(match)
    match.auctionResumePhase = resumePhase
    const auction: AuctionState = {
      tile, highestBid: 0, highestBidderId: null, passed: [],
      endsAt: this.now() + state.settings.auctionTimer * 1000, bankQueue,
    }
    state.auction = auction
    state.phase = 'AUCTION'
    state.deadline = auction.endsAt
    this.log(match, `${this.board(match)[tile].name} is up for auction.`)
  }

  private auctionAction(match: InternalMatch, playerId: string, action: Extract<PropertyAction, { type: 'auction_bid' | 'auction_pass' }>): void {
    const state = match.state
    const auction = state.auction
    if (state.phase !== 'AUCTION' || !auction) throw new RoomError('INVALID_GAME_STATE', 'There is no auction right now.')
    if (auction.passed.includes(playerId)) fail('You already passed this auction.')
    if (this.now() >= auction.endsAt) { this.finishAuction(match); return }
    if (action.type === 'auction_pass') {
      auction.passed.push(playerId)
      this.log(match, `${this.name(match, playerId)} passed on ${this.board(match)[auction.tile].name}.`)
    } else {
      const min = auction.highestBid + state.settings.auctionIncrement
      if (!Number.isInteger(action.amount) || action.amount < min || action.amount > state.players[playerId].cash) {
        throw new RoomError('INVALID_INPUT', `Bid at least $${min}, and no more than your cash.`)
      }
      auction.highestBid = action.amount
      auction.highestBidderId = playerId
      auction.endsAt = this.now() + 5000
      state.deadline = auction.endsAt
      this.log(match, `${this.name(match, playerId)} bid $${action.amount} on ${this.board(match)[auction.tile].name}.`)
    }
    const active = state.order.filter((id) => !state.players[id].bankrupt)
    if (active.every((id) => auction.passed.includes(id) || id === auction.highestBidderId)) this.finishAuction(match)
  }

  private finishAuction(match: InternalMatch): void {
    const state = match.state
    const auction = state.auction
    if (!auction) return
    const tile = this.board(match)[auction.tile]
    if (auction.highestBidderId && !state.properties[auction.tile].ownerId) {
      const winner = state.players[auction.highestBidderId]
      if (winner && !winner.bankrupt && winner.cash >= auction.highestBid) {
        winner.cash -= auction.highestBid
        winner.stats.purchased += 1
        state.properties[auction.tile].ownerId = winner.id
        this.log(match, `${this.name(match, winner.id)} won ${tile.name} for $${auction.highestBid}.`)
      }
    } else this.log(match, `${tile.name} did not sell at auction.`)
    const next = auction.bankQueue.shift()
    state.auction = null
    if (next !== undefined) {
      this.startAuction(match, next, auction.bankQueue, match.auctionResumePhase)
      return
    }
    if (match.payments.length) { this.processPayments(match); return }
    if (state.players[state.currentPlayerId].bankrupt) this.advanceTurn(match)
    else this.setPhase(match, match.auctionResumePhase, true)
  }

  private manageProperty(match: InternalMatch, playerId: string, action: Extract<PropertyAction, { type: 'build' | 'sell_building' | 'mortgage' | 'unmortgage' }>): void {
    const state = match.state
    const tile = this.board(match)[action.tile]
    if (!tile || tile.price === undefined || !Number.isInteger(action.tile)) throw new RoomError('INVALID_INPUT', 'Choose one of your properties.')
    const holding = state.properties[tile.index]
    if (holding.ownerId !== playerId) fail('You do not own that property.')
    const isDebtor = state.phase === 'DEBT' && state.debt?.playerId === playerId
    const mayManage = state.phase === 'MANAGEMENT' || isDebtor || (state.settings.buildingTiming !== 'end_turn' && ['PRE_ROLL', 'PROPERTY_DECISION'].includes(state.phase))
    if (!mayManage) fail('Property management is unavailable right now.')
    if (state.settings.buildingTiming !== 'any_time' && playerId !== state.currentPlayerId) fail('Manage properties on your own turn.')
    if (state.settings.buildingTiming === 'end_turn' && state.phase !== 'MANAGEMENT' && !isDebtor) fail('You can build at the end of your turn only.')
    if (action.type === 'mortgage') {
      if (holding.mortgaged) fail('This property is already mortgaged.')
      if (tile.group && groupTiles(state, tile).some((item) => state.properties[item.index].buildings > 0)) fail('Sell every building in this colour group first.')
      holding.mortgaged = true
      state.players[playerId].cash += tile.mortgage ?? 0
      this.log(match, `${this.name(match, playerId)} mortgaged ${tile.name} for $${tile.mortgage}.`)
    } else if (action.type === 'unmortgage') {
      if (holding.mortgaged === false) fail('This property is not mortgaged.')
      if (isDebtor) fail('Resolve your debt before spending on a mortgage.')
      const cost = (tile.mortgage ?? 0) + Math.ceil((tile.mortgage ?? 0) * state.settings.mortgageInterest / 100)
      if (state.players[playerId].cash < cost) fail(`You need $${cost} to unmortgage.`)
      state.players[playerId].cash -= cost
      holding.mortgaged = false
      this.log(match, `${this.name(match, playerId)} unmortgaged ${tile.name} for $${cost}.`)
    } else if (action.type === 'build') {
      if (isDebtor) fail('Resolve your debt before building.')
      if (!tile.group || !ownedGroup(state, playerId, tile.group) || groupTiles(state, tile).some((item) => state.properties[item.index].mortgaged)) fail('Own an entire unmortgaged colour group to build.')
      if (holding.buildings >= 5) fail('This property already has a hotel.')
      const group = groupTiles(state, tile).map((item) => state.properties[item.index].buildings)
      if (state.settings.buildingRule === 'even' && holding.buildings !== Math.min(...group)) fail('Build evenly across this colour group.')
      if (holding.buildings === 4 && group.some((level) => level < 4)) fail('All properties in this group need four houses before a hotel.')
      if (state.players[playerId].cash < (tile.buildCost ?? 0)) fail('You cannot afford that building.')
      const supply = buildingSupply(state)
      if (state.settings.limitedBuildings && (holding.buildings === 4 ? supply.hotels < 1 : supply.houses < 1)) fail('The bank is out of those buildings.')
      state.players[playerId].cash -= tile.buildCost ?? 0
      holding.buildings += 1
      if (holding.buildings === 5) state.players[playerId].stats.hotelsBuilt += 1
      else state.players[playerId].stats.housesBuilt += 1
      this.log(match, `${this.name(match, playerId)} built ${holding.buildings === 5 ? 'a hotel' : 'a house'} on ${tile.name}.`)
    } else {
      if (holding.buildings < 1) fail('There are no buildings to sell.')
      const group = groupTiles(state, tile).map((item) => state.properties[item.index].buildings)
      if (state.settings.buildingRule === 'even' && holding.buildings !== Math.max(...group)) fail('Sell evenly across this colour group.')
      if (holding.buildings === 5 && state.settings.limitedBuildings && buildingSupply(state).houses < 4) fail('The bank needs four houses available before you can sell this hotel.')
      holding.buildings -= 1
      const refund = Math.floor((tile.buildCost ?? 0) * state.settings.buildingSellPercent / 100)
      state.players[playerId].cash += refund
      this.log(match, `${this.name(match, playerId)} sold a building on ${tile.name} for $${refund}.`)
    }
    if (isDebtor && state.debt && state.players[playerId].cash >= state.debt.amount) this.settleDebt(match)
  }

  private validateAssets(match: InternalMatch, ownerId: string, assets: TradeAssets): void {
    const state = match.state
    if (!assets || !Number.isInteger(assets.cash) || assets.cash < 0 || assets.cash > state.players[ownerId].cash || !Array.isArray(assets.properties) || !Array.isArray(assets.jailCards)) {
      throw new RoomError('INVALID_INPUT', 'The trade contains unavailable cash or assets.')
    }
    if (new Set(assets.properties).size !== assets.properties.length || new Set(assets.jailCards).size !== assets.jailCards.length) fail('Trade assets cannot be duplicated.')
    for (const index of assets.properties) {
      const tile = this.board(match)[index]
      if (!Number.isInteger(index) || !tile || tile.price === undefined || state.properties[index].ownerId !== ownerId) fail('One of those properties is no longer available.')
      if (!state.settings.tradeDevelopedGroups && tile.group && groupTiles(state, tile).some((item) => state.properties[item.index].buildings > 0)) fail('Sell buildings in that colour group before trading it.')
    }
    for (const cardId of assets.jailCards) {
      if (!state.players[ownerId].jailCards.includes(cardId)) fail('One of those jail cards is no longer available.')
    }
  }

  private proposeTrade(match: InternalMatch, playerId: string, action: Extract<PropertyAction, { type: 'trade_offer' }>): void {
    const state = match.state
    if (!state.settings.trading) fail('Trading is turned off.')
    if (playerId !== state.currentPlayerId && state.debt?.playerId !== playerId) fail('You can propose trades on your turn.')
    if (!['PRE_ROLL', 'MANAGEMENT', 'DEBT'].includes(state.phase)) fail('Finish the current action before trading.')
    if (state.phase === 'DEBT' && state.debt?.playerId !== playerId) fail('The debtor must resolve their balance first.')
    if (!state.players[action.toId] || state.players[action.toId].bankrupt || playerId === action.toId) fail('Choose an active player to trade with.')
    this.validateAssets(match, playerId, action.give)
    this.validateAssets(match, action.toId, action.receive)
    if (![action.give, action.receive].some((assets) => assets.cash > 0 || assets.properties.length > 0 || assets.jailCards.length > 0)) fail('Add cash, property or a jail card to the trade.')
    const offer: TradeOffer = { id: randomUUID(), fromId: playerId, toId: action.toId, give: action.give, receive: action.receive, previousPhase: state.phase }
    this.suspendTurnDeadline(match)
    state.trade = offer
    this.setPhase(match, 'TRADE_PENDING')
    state.deadline = this.now() + 60_000
    this.log(match, `${this.name(match, playerId)} proposed a trade to ${this.name(match, action.toId)}.`)
  }

  private respondToTrade(match: InternalMatch, playerId: string, action: Extract<PropertyAction, { type: 'trade_accept' | 'trade_decline' | 'trade_cancel' | 'trade_counter' }>): void {
    const state = match.state
    const offer = state.trade
    if (state.phase !== 'TRADE_PENDING' || !offer || offer.id !== action.offerId) throw new RoomError('INVALID_GAME_STATE', 'That trade offer is no longer available.')
    if (action.type === 'trade_cancel') {
      if (offer.fromId !== playerId) fail('Only the sender can cancel this trade.')
      this.declineTrade(match)
      return
    }
    if (offer.toId !== playerId) fail('Only the receiving player can answer this trade.')
    if (action.type === 'trade_decline') { this.declineTrade(match); return }
    if (action.type === 'trade_counter') {
      this.validateAssets(match, playerId, action.give)
      this.validateAssets(match, offer.fromId, action.receive)
      state.trade = { id: randomUUID(), fromId: playerId, toId: offer.fromId, give: action.give, receive: action.receive, previousPhase: offer.previousPhase }
      state.deadline = this.now() + 60_000
      this.log(match, `${this.name(match, playerId)} sent a counteroffer.`)
      return
    }
    this.validateAssets(match, offer.fromId, offer.give)
    this.validateAssets(match, offer.toId, offer.receive)
    const from = state.players[offer.fromId]
    const to = state.players[offer.toId]
    from.cash += offer.receive.cash - offer.give.cash
    to.cash += offer.give.cash - offer.receive.cash
    for (const index of offer.give.properties) state.properties[index].ownerId = to.id
    for (const index of offer.receive.properties) state.properties[index].ownerId = from.id
    for (const id of offer.give.jailCards) { from.jailCards.splice(from.jailCards.indexOf(id), 1); to.jailCards.push(id) }
    for (const id of offer.receive.jailCards) { to.jailCards.splice(to.jailCards.indexOf(id), 1); from.jailCards.push(id) }
    from.stats.trades += 1
    to.stats.trades += 1
    state.trade = null
    this.setPhase(match, offer.previousPhase, true)
    this.log(match, `${this.name(match, from.id)} and ${this.name(match, to.id)} completed a trade.`)
    if (state.debt && state.players[state.debt.playerId].cash >= state.debt.amount) this.settleDebt(match)
  }

  private declineTrade(match: InternalMatch): void {
    const offer = match.state.trade
    if (!offer) return
    match.state.trade = null
    this.setPhase(match, offer.previousPhase, true)
    this.log(match, 'The trade offer was declined.')
  }

  private bankrupt(match: InternalMatch, playerId: string, creditorId: string | null): void {
    const state = match.state
    const player = state.players[playerId]
    if (!player || player.bankrupt) return
    const wasDebtor = state.debt?.playerId === playerId
    const resumePhase = wasDebtor ? 'MANAGEMENT' : state.trade?.previousPhase ?? (state.phase === 'INTRO' ? 'PRE_ROLL' : state.phase)
    if (state.debt?.creditorId === playerId) state.debt.creditorId = null
    const owned = this.ownable(match).filter((tile) => state.properties[tile.index].ownerId === playerId)
    for (const tile of owned) {
      const holding = state.properties[tile.index]
      if (holding.buildings) {
        player.cash += Math.floor((tile.buildCost ?? 0) * state.settings.buildingSellPercent / 100) * holding.buildings
        holding.buildings = 0
      }
    }
    const creditor = creditorId ? state.players[creditorId] : null
    if (creditor && !creditor.bankrupt) {
      creditor.cash += player.cash
      for (const tile of owned) state.properties[tile.index].ownerId = creditor.id
      creditor.jailCards.push(...player.jailCards)
    } else {
      for (const tile of owned) { state.properties[tile.index].ownerId = null; state.properties[tile.index].mortgaged = false }
      for (const cardId of player.jailCards) {
        const card = CARDS.find((item) => item.id === cardId)
        if (card) match.decks[card.deck].push(cardId)
      }
    }
    player.cash = 0
    player.jailCards = []
    player.bankrupt = true
    if (wasDebtor) state.debt = null
    match.pendingJailMove = null
    match.pendingJailRelease = false
    state.trade = null
    match.payments = match.payments.filter((payment) => payment.payerId !== playerId && payment.creditorId !== playerId)
    this.log(match, `${this.name(match, playerId)} went bankrupt${creditor ? ` to ${this.name(match, creditor.id)}` : ' to the bank'}.`)
    if (this.checkLastStanding(match)) return
    if (state.phase === 'AUCTION' && state.auction) {
      if (state.auction.highestBidderId === playerId) {
        state.auction.highestBidderId = null
        state.auction.highestBid = 0
      }
      if (!creditor && state.settings.auctions) state.auction.bankQueue.push(...owned.map((tile) => tile.index))
    } else if (state.debt) this.setPhase(match, 'DEBT')
    else if (!creditor && owned.length && state.settings.auctions) {
      this.startAuction(match, owned[0].index, owned.slice(1).map((tile) => tile.index), resumePhase)
    } else if (match.payments.length) this.processPayments(match)
    else if (state.currentPlayerId === playerId) this.advanceTurn(match)
    else this.setPhase(match, resumePhase, true)
  }

  playerLeft(roomCode: string, playerId: string): MatchSnapshot | null {
    const match = this.matches.get(roomCode)
    if (!match || !match.state.players[playerId] || match.state.players[playerId].bankrupt || match.state.phase === 'FINISHED') return null
    this.bankrupt(match, playerId, null)
    return this.publish(roomCode, match)
  }

  private checkLastStanding(match: InternalMatch): boolean {
    const remaining = match.state.order.filter((id) => !match.state.players[id].bankrupt)
    if (remaining.length !== 1) return false
    match.state.status = 'FINISHED'
    match.state.phase = 'FINISHED'
    match.state.deadline = null
    match.state.winnerId = remaining[0]
    match.state.winnerReason = 'Last player standing'
    this.log(match, `${this.name(match, remaining[0])} is the last player standing!`)
    return true
  }

  private finishByWorth(match: InternalMatch, reason: string): void {
    const state = match.state
    const eligible = state.order.filter((id) => !state.players[id].bankrupt)
    eligible.sort((a, b) => {
      const worth = netWorth(state, b) - netWorth(state, a)
      if (worth) return worth
      const unmortgaged = (id: string) => this.ownable(match).reduce((sum, tile) => sum + (state.properties[tile.index].ownerId === id && !state.properties[tile.index].mortgaged ? tile.price ?? 0 : 0), 0)
      const value = unmortgaged(b) - unmortgaged(a)
      if (value) return value
      const sets = completeSetCount(state, b) - completeSetCount(state, a)
      if (sets) return sets
      return state.players[b].cash - state.players[a].cash
    })
    // Exact ties are exceptionally rare; roll until they separate.
    if (eligible.length > 1) {
      const first = eligible[0]
      const unmortgaged = (id: string) => this.ownable(match).reduce((sum, tile) => sum + (state.properties[tile.index].ownerId === id && !state.properties[tile.index].mortgaged ? tile.price ?? 0 : 0), 0)
      const tied = eligible.filter((id) => netWorth(state, id) === netWorth(state, first) && unmortgaged(id) === unmortgaged(first) && state.players[id].cash === state.players[first].cash && completeSetCount(state, id) === completeSetCount(state, first))
      if (tied.length > 1) {
        let rollWinner = tied[0]
        let best = -1
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const scores = tied.map((id) => ({ id, score: this.die() + this.die() }))
          best = Math.max(...scores.map((score) => score.score))
          if (scores.filter((score) => score.score === best).length === 1) { rollWinner = scores.find((score) => score.score === best)!.id; break }
        }
        eligible.splice(eligible.indexOf(rollWinner), 1)
        eligible.unshift(rollWinner)
      }
    }
    state.status = 'FINISHED'
    state.phase = 'FINISHED'
    state.deadline = null
    state.winnerId = eligible[0] ?? null
    state.winnerReason = reason
    this.log(match, `Game over: ${reason}`)
  }

  private endTurn(match: InternalMatch): void {
    const state = match.state
    const current = state.players[state.currentPlayerId]
    if (state.doublesCount > 0 && state.settings.doublesExtraTurn && !current.inJail) {
      this.log(match, `${this.name(match, current.id)} gets another roll for doubles.`)
      this.setPhase(match, 'PRE_ROLL')
      return
    }
    this.advanceTurn(match)
  }

  private advanceTurn(match: InternalMatch): void {
    const state = match.state
    if (this.checkLastStanding(match)) return
    const leaving = state.players[state.currentPlayerId]
    if (match.autoThisTurn) {
      leaving.afkTurns += 1
      if (leaving.afkTurns >= 3) this.log(match, `${this.name(match, leaving.id)} appears to be away; turns will continue automatically.`)
    } else leaving.afkTurns = 0
    match.autoThisTurn = false
    const currentIndex = state.order.indexOf(state.currentPlayerId)
    let nextIndex = currentIndex
    do { nextIndex = (nextIndex + 1) % state.order.length } while (state.players[state.order[nextIndex]].bankrupt)
    const wrapped = nextIndex <= currentIndex
    if (wrapped) {
      if (state.settings.endCondition === 'rounds' && state.round >= state.settings.maxRounds) {
        this.finishByWorth(match, `Round limit reached (${state.settings.maxRounds})`)
        return
      }
      if (state.settings.endCondition === 'time' && state.endsAt !== null && this.now() >= state.endsAt) {
        this.finishByWorth(match, 'Time limit reached')
        return
      }
      state.round += 1
    }
    state.turnNumber += 1
    state.currentPlayerId = state.order[nextIndex]
    state.doublesCount = 0
    state.dice = null
    state.lastRollAt = null
    state.lastCard = null
    state.lastCardPlayerId = null
    state.lastCardAt = null
    this.setPhase(match, 'PRE_ROLL')
    this.log(match, `${this.name(match, state.currentPlayerId)}'s turn begins.`)
  }
}
