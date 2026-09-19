import { randomBytes, randomUUID } from 'node:crypto'
import { isGameId, type GameId } from '../shared/games.js'
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  DISCONNECT_GRACE_MS,
  MAX_PLAYER_OPTIONS,
  PLAYER_AVATAR_IDS,
  PLAYER_COLOUR_IDS,
  ROOM_CODE_CHARACTERS,
  ROOM_CODE_LENGTH,
  ROOM_INACTIVITY_MS,
  type JoinRoomInput,
  type Player,
  type PlayerIdentityInput,
  type RoomErrorCode,
  type RoomSettings,
  type RoomSnapshot,
  type RoomStatus,
  type RoomSummary,
  type SessionCredentials,
  type SessionResponse,
  type SocketSession,
} from '../shared/protocol.js'

interface StoredPlayer extends Player {
  sessionToken: string
  connectionIds: Set<string>
  joinedAt: number
  disconnectedAt: number | null
}

interface StoredRoom {
  id: string
  code: string
  status: RoomStatus
  selectedGameId: GameId | null
  hostId: string
  players: Map<string, StoredPlayer>
  settings: RoomSettings
  createdAt: number
  updatedAt: number
}

export interface PlayerRemovalResult {
  room: RoomSnapshot | null
  roomClosed: boolean
  removedName: string
  removedConnectionIds: string[]
  newHostName?: string
  retained?: boolean
}

export interface DisconnectResult {
  room: RoomSnapshot
  becameDisconnected: boolean
  playerName: string
}

export interface CloseRoomResult {
  connectionIds: string[]
}

export interface ExpiredRoom {
  code: string
  connectionIds: string[]
}

interface RoomManagerOptions {
  now?: () => number
  createId?: () => string
  createToken?: () => string
  createCode?: () => string
}

export class RoomError extends Error {
  readonly code: RoomErrorCode

  constructor(code: RoomErrorCode, message: string) {
    super(message)
    this.name = 'RoomError'
    this.code = code
  }
}

export class RoomManager {
  private readonly rooms = new Map<string, StoredRoom>()
  private readonly now: () => number
  private readonly createId: () => string
  private readonly createToken: () => string
  private readonly createCodeOverride?: () => string

  constructor(options: RoomManagerOptions = {}) {
    this.now = options.now ?? Date.now
    this.createId = options.createId ?? randomUUID
    this.createToken = options.createToken ?? (() => randomBytes(24).toString('base64url'))
    this.createCodeOverride = options.createCode
  }

  inspectRoom(rawCode: unknown): RoomSummary {
    const room = this.requireRoom(rawCode)

    return {
      code: room.code,
      playerCount: room.players.size,
      maxPlayers: room.settings.maxPlayers,
    }
  }

  createRoom(input: PlayerIdentityInput, connectionId: string): SessionResponse {
    const identity = this.validateIdentity(input)
    const timestamp = this.now()
    const code = this.generateRoomCode()
    const player = this.createPlayer(identity, connectionId, timestamp)
    const room: StoredRoom = {
      id: this.createId(),
      code,
      status: 'WAITING',
      selectedGameId: null,
      hostId: player.id,
      players: new Map([[player.id, player]]),
      settings: {
        maxPlayers: 8,
        allowLateJoin: false,
        filterNames: true,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    this.rooms.set(code, room)

    return {
      session: this.toCredentials(room, player),
      room: this.toSnapshot(room),
    }
  }

  joinRoom(input: JoinRoomInput, connectionId: string): SessionResponse {
    if (!input || typeof input !== 'object') {
      throw new RoomError('INVALID_INPUT', 'Enter valid room details.')
    }

    const room = this.requireRoom(input.roomCode)
    if (room.status === 'PLAYING') {
      throw new RoomError('GAME_STARTED', 'Game in progress. Wait for the next match.')
    }
    const identity = this.validateIdentity(input)

    if (room.players.size >= room.settings.maxPlayers) {
      throw new RoomError('ROOM_FULL', 'This room is full.')
    }

    const duplicateName = [...room.players.values()].some(
      (player) => player.name.localeCompare(identity.name, undefined, { sensitivity: 'base' }) === 0,
    )

    if (duplicateName) {
      throw new RoomError('NAME_TAKEN', 'That name is already being used in this room.')
    }

    const player = this.createPlayer(identity, connectionId, this.now())
    room.players.set(player.id, player)
    this.touch(room)

    return {
      session: this.toCredentials(room, player),
      room: this.toSnapshot(room),
    }
  }

  reconnect(session: SessionCredentials, connectionId: string): RoomSnapshot {
    if (
      !session ||
      typeof session !== 'object' ||
      typeof session.roomCode !== 'string' ||
      typeof session.playerId !== 'string' ||
      typeof session.sessionToken !== 'string'
    ) {
      throw new RoomError('SESSION_INVALID', 'Your room session is no longer valid.')
    }

    const room = this.requireRoom(session.roomCode)
    const player = room.players.get(session.playerId)

    if (!player || player.sessionToken !== session.sessionToken) {
      throw new RoomError('SESSION_INVALID', 'Your room session is no longer valid.')
    }

    player.connectionIds.add(connectionId)
    player.isConnected = true
    player.disconnectedAt = null
    if (room.status === 'PLAYING' && room.hostId !== player.id) {
      const host = room.players.get(room.hostId)
      if (host && !host.isConnected && host.disconnectedAt !== null && this.now() - host.disconnectedAt >= DISCONNECT_GRACE_MS) room.hostId = player.id
    }
    this.touch(room)
    return this.toSnapshot(room)
  }

  updateSettings(
    session: SocketSession,
    connectionId: string,
    settings: RoomSettings,
  ): RoomSnapshot {
    const { room } = this.authorizeHost(session, connectionId)

    if (room.status !== 'WAITING') {
      throw new RoomError('INVALID_GAME_STATE', 'Room settings can only change in the party lobby.')
    }

    const validatedSettings = this.validateSettings(settings)

    if (validatedSettings.maxPlayers < room.players.size) {
      throw new RoomError(
        'INVALID_INPUT',
        `Max players cannot be lower than the ${room.players.size} people already here.`,
      )
    }

    room.settings = validatedSettings
    this.touch(room)
    return this.toSnapshot(room)
  }

  kickPlayer(
    session: SocketSession,
    connectionId: string,
    playerId: string,
  ): PlayerRemovalResult {
    const { room } = this.authorizeHost(session, connectionId)

    if (room.status === 'PLAYING') {
      throw new RoomError('INVALID_GAME_STATE', 'Players cannot be removed during a match.')
    }

    if (typeof playerId !== 'string') {
      throw new RoomError('INVALID_INPUT', 'Choose a valid player.')
    }

    if (playerId === room.hostId) {
      throw new RoomError('INVALID_INPUT', 'Transfer host before removing yourself.')
    }

    return this.removePlayer(room, playerId)
  }

  transferHost(
    session: SocketSession,
    connectionId: string,
    playerId: string,
  ): RoomSnapshot {
    const { room } = this.authorizeHost(session, connectionId)

    if (typeof playerId !== 'string') {
      throw new RoomError('INVALID_INPUT', 'Choose a valid player.')
    }

    const nextHost = room.players.get(playerId)

    if (!nextHost) {
      throw new RoomError('PLAYER_NOT_FOUND', 'That player is no longer in the room.')
    }

    if (!nextHost.isConnected) {
      throw new RoomError('INVALID_INPUT', 'Wait for that player to reconnect first.')
    }

    if (nextHost.id === room.hostId) {
      return this.toSnapshot(room)
    }

    room.hostId = nextHost.id
    this.touch(room)
    return this.toSnapshot(room)
  }

  leaveRoom(session: SocketSession, connectionId: string): PlayerRemovalResult {
    const { room, player } = this.authorize(session, connectionId)
    return this.removePlayer(room, player.id)
  }

  closeRoom(session: SocketSession, connectionId: string): CloseRoomResult {
    const { room } = this.authorizeHost(session, connectionId)
    const connectionIds = [...room.players.values()].flatMap((player) => [
      ...player.connectionIds,
    ])

    this.rooms.delete(room.code)
    return { connectionIds }
  }

  openGameSelection(session: SocketSession, connectionId: string): RoomSnapshot {
    const { room } = this.authorizeHost(session, connectionId)

    if (room.status !== 'WAITING') {
      throw new RoomError('INVALID_GAME_STATE', 'The room has already left the party lobby.')
    }

    room.status = 'GAME_SELECT'
    room.selectedGameId = null
    this.touch(room)
    return this.toSnapshot(room)
  }

  selectGame(
    session: SocketSession,
    connectionId: string,
    gameId: GameId,
  ): RoomSnapshot {
    const { room } = this.authorizeHost(session, connectionId)

    if (room.status !== 'GAME_SELECT') {
      throw new RoomError('INVALID_GAME_STATE', 'Return to game selection before choosing a game.')
    }

    if (!isGameId(gameId)) {
      throw new RoomError('INVALID_INPUT', 'Choose a supported game.')
    }

    room.status = 'GAME_SETUP'
    room.selectedGameId = gameId
    this.touch(room)
    return this.toSnapshot(room)
  }

  returnToGameSelection(session: SocketSession, connectionId: string): RoomSnapshot {
    const { room } = this.authorizeHost(session, connectionId)

    if (room.status !== 'GAME_SETUP') {
      throw new RoomError('INVALID_GAME_STATE', 'There is no game menu to leave.')
    }

    room.status = 'GAME_SELECT'
    room.selectedGameId = null
    this.touch(room)
    return this.toSnapshot(room)
  }

  returnToLobby(session: SocketSession, connectionId: string): RoomSnapshot {
    const { room } = this.authorizeHost(session, connectionId)

    if (room.status === 'WAITING') {
      return this.toSnapshot(room)
    }

    if (room.status !== 'GAME_SELECT' && room.status !== 'GAME_SETUP') {
      throw new RoomError('INVALID_GAME_STATE', 'The room cannot return to the lobby right now.')
    }

    room.status = 'WAITING'
    room.selectedGameId = null
    this.touch(room)
    return this.toSnapshot(room)
  }

  getAuthorizedRoom(session: SocketSession, connectionId: string): RoomSnapshot {
    return this.toSnapshot(this.authorize(session, connectionId).room)
  }

  getRoomByCode(roomCode: string): RoomSnapshot | null {
    const room = this.rooms.get(roomCode)
    return room ? this.toSnapshot(room) : null
  }

  startSelectedGame(session: SocketSession, connectionId: string): RoomSnapshot {
    const { room } = this.authorizeHost(session, connectionId)
    if (room.status !== 'GAME_SETUP' || room.selectedGameId !== 'property_game') {
      throw new RoomError('INVALID_GAME_STATE', 'Select Own It! before starting.')
    }
    room.status = 'PLAYING'
    this.touch(room)
    return this.toSnapshot(room)
  }

  finishSelectedGame(session: SocketSession, connectionId: string, destination: 'GAME_SETUP' | 'GAME_SELECT'): RoomSnapshot {
    const { room } = this.authorizeHost(session, connectionId)
    if (room.status !== 'PLAYING' || room.selectedGameId !== 'property_game') {
      throw new RoomError('INVALID_GAME_STATE', 'There is no Own It! match to leave.')
    }
    room.status = destination
    room.selectedGameId = destination === 'GAME_SELECT' ? null : 'property_game'
    this.touch(room)
    return this.toSnapshot(room)
  }

  disconnect(
    session: SocketSession,
    connectionId: string,
  ): DisconnectResult | null {
    const room = this.rooms.get(session.roomCode)
    const player = room?.players.get(session.playerId)

    if (!room || !player || !player.connectionIds.has(connectionId)) {
      return null
    }

    player.connectionIds.delete(connectionId)
    const becameDisconnected = player.connectionIds.size === 0

    if (becameDisconnected) {
      player.isConnected = false
      player.disconnectedAt = this.now()
      this.touch(room)
    }

    return {
      room: this.toSnapshot(room),
      becameDisconnected,
      playerName: player.name,
    }
  }

  removeDisconnectedPlayer(roomCode: string, playerId: string): PlayerRemovalResult | null {
    const room = this.rooms.get(roomCode)
    const player = room?.players.get(playerId)

    if (!room || !player || player.isConnected || player.connectionIds.size > 0) {
      return null
    }

    if (room.status === 'PLAYING') {
      let newHostName: string | undefined
      if (room.hostId === playerId) {
        const nextHost = [...room.players.values()].find((candidate) => candidate.isConnected)
        if (nextHost) {
          room.hostId = nextHost.id
          newHostName = nextHost.name
        }
      }
      this.touch(room)
      return { room: this.toSnapshot(room), roomClosed: false, removedName: player.name, removedConnectionIds: [], newHostName, retained: true }
    }

    return this.removePlayer(room, playerId)
  }

  expireInactiveRooms(): ExpiredRoom[] {
    const expiryBoundary = this.now() - ROOM_INACTIVITY_MS
    const expiredRooms: ExpiredRoom[] = []

    for (const room of this.rooms.values()) {
      if (room.status === 'PLAYING' && [...room.players.values()].some((player) => player.isConnected)) continue
      if (room.updatedAt > expiryBoundary) continue

      expiredRooms.push({
        code: room.code,
        connectionIds: [...room.players.values()].flatMap((player) => [
          ...player.connectionIds,
        ]),
      })
      this.rooms.delete(room.code)
    }

    return expiredRooms
  }

  private authorize(session: SocketSession, connectionId: string) {
    const room = this.requireRoom(session.roomCode)
    const player = room.players.get(session.playerId)

    if (!player || !player.connectionIds.has(connectionId)) {
      throw new RoomError('SESSION_INVALID', 'Your room session is no longer valid.')
    }

    return { room, player }
  }

  private authorizeHost(session: SocketSession, connectionId: string) {
    const authorized = this.authorize(session, connectionId)

    if (authorized.room.hostId !== authorized.player.id) {
      throw new RoomError('HOST_ONLY', 'Only the host can do that.')
    }

    return authorized
  }

  private requireRoom(rawCode: unknown) {
    const code = this.normaliseRoomCode(rawCode)
    const room = this.rooms.get(code)

    if (!room) {
      throw new RoomError('ROOM_NOT_FOUND', "We couldn't find that room.")
    }

    return room
  }

  private normaliseRoomCode(value: unknown) {
    if (typeof value !== 'string') {
      throw new RoomError('INVALID_INPUT', 'Enter a valid room code.')
    }

    const code = value.toUpperCase().replace(/\s/g, '')

    if (
      code.length !== ROOM_CODE_LENGTH ||
      [...code].some((character) => !ROOM_CODE_CHARACTERS.includes(character))
    ) {
      throw new RoomError('INVALID_INPUT', 'Enter a valid 4-character room code.')
    }

    return code
  }

  private validateIdentity(input: PlayerIdentityInput) {
    if (!input || typeof input !== 'object' || typeof input.name !== 'string') {
      throw new RoomError('INVALID_INPUT', 'Enter a valid player name.')
    }

    const name = input.name.trim().replace(/\s+/g, ' ')

    if (name.length < DISPLAY_NAME_MIN_LENGTH) {
      throw new RoomError(
        'INVALID_INPUT',
        `Use at least ${DISPLAY_NAME_MIN_LENGTH} characters for your name.`,
      )
    }

    if (name.length > DISPLAY_NAME_MAX_LENGTH) {
      throw new RoomError(
        'INVALID_INPUT',
        `Keep your name to ${DISPLAY_NAME_MAX_LENGTH} characters.`,
      )
    }

    if (!PLAYER_AVATAR_IDS.includes(input.avatar)) {
      throw new RoomError('INVALID_INPUT', 'Choose a valid avatar.')
    }

    if (!PLAYER_COLOUR_IDS.includes(input.colour)) {
      throw new RoomError('INVALID_INPUT', 'Choose a valid player colour.')
    }

    return { name, avatar: input.avatar, colour: input.colour }
  }

  private validateSettings(settings: RoomSettings): RoomSettings {
    if (!settings || typeof settings !== 'object') {
      throw new RoomError('INVALID_INPUT', 'Enter valid room settings.')
    }

    if (!MAX_PLAYER_OPTIONS.includes(settings.maxPlayers as (typeof MAX_PLAYER_OPTIONS)[number])) {
      throw new RoomError('INVALID_INPUT', 'Choose a supported room size.')
    }

    if (
      typeof settings.allowLateJoin !== 'boolean' ||
      typeof settings.filterNames !== 'boolean'
    ) {
      throw new RoomError('INVALID_INPUT', 'Enter valid room settings.')
    }

    return {
      maxPlayers: settings.maxPlayers,
      allowLateJoin: settings.allowLateJoin,
      filterNames: settings.filterNames,
    }
  }

  private createPlayer(
    identity: PlayerIdentityInput,
    connectionId: string,
    joinedAt: number,
  ): StoredPlayer {
    return {
      id: this.createId(),
      name: identity.name,
      avatar: identity.avatar,
      colour: identity.colour,
      isConnected: true,
      sessionToken: this.createToken(),
      connectionIds: new Set([connectionId]),
      joinedAt,
      disconnectedAt: null,
    }
  }

  private removePlayer(room: StoredRoom, playerId: string): PlayerRemovalResult {
    const player = room.players.get(playerId)

    if (!player) {
      throw new RoomError('PLAYER_NOT_FOUND', 'That player is no longer in the room.')
    }

    const wasHost = room.hostId === playerId
    const removedConnectionIds = [...player.connectionIds]
    room.players.delete(playerId)

    if (room.players.size === 0) {
      this.rooms.delete(room.code)
      return {
        room: null,
        roomClosed: true,
        removedName: player.name,
        removedConnectionIds,
      }
    }

    let newHostName: string | undefined

    if (wasHost) {
      const nextHost =
        [...room.players.values()].find((candidate) => candidate.isConnected) ??
        room.players.values().next().value

      if (!nextHost) {
        throw new RoomError('INTERNAL_ERROR', 'Unable to transfer host control.')
      }

      room.hostId = nextHost.id
      newHostName = nextHost.name
    }

    this.touch(room)
    return {
      room: this.toSnapshot(room),
      roomClosed: false,
      removedName: player.name,
      removedConnectionIds,
      newHostName,
    }
  }

  private generateRoomCode() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const code = this.createCodeOverride
        ? this.createCodeOverride().toUpperCase()
        : Array.from(
            { length: ROOM_CODE_LENGTH },
            () => ROOM_CODE_CHARACTERS[randomBytes(1)[0] % ROOM_CODE_CHARACTERS.length],
          ).join('')

      if (
        code.length === ROOM_CODE_LENGTH &&
        [...code].every((character) => ROOM_CODE_CHARACTERS.includes(character)) &&
        !this.rooms.has(code)
      ) {
        return code
      }
    }

    throw new RoomError('INTERNAL_ERROR', 'Could not create a unique room code. Try again.')
  }

  private touch(room: StoredRoom) {
    room.updatedAt = this.now()
  }

  private toCredentials(room: StoredRoom, player: StoredPlayer): SessionCredentials {
    return {
      roomCode: room.code,
      playerId: player.id,
      sessionToken: player.sessionToken,
    }
  }

  private toSnapshot(room: StoredRoom): RoomSnapshot {
    return {
      code: room.code,
      status: room.status,
      selectedGameId: room.selectedGameId,
      hostId: room.hostId,
      players: [...room.players.values()].map((player) => ({
        id: player.id,
        name: player.name,
        avatar: player.avatar,
        colour: player.colour,
        isConnected: player.isConnected,
      })),
      settings: { ...room.settings },
      createdAt: new Date(room.createdAt).toISOString(),
      updatedAt: new Date(room.updatedAt).toISOString(),
    }
  }
}
