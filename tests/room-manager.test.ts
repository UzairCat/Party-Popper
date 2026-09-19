// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { ROOM_INACTIVITY_MS, type PlayerIdentityInput } from '../shared/protocol'
import { RoomError, RoomManager } from '../server/room-manager'

const HOST: PlayerIdentityInput = {
  name: 'Uzair',
  avatar: 'robot',
  colour: 'purple',
}

const GUEST: PlayerIdentityInput = {
  name: 'Alex',
  avatar: 'frog',
  colour: 'green',
}

function createHarness() {
  let timestamp = Date.UTC(2026, 8, 18, 12, 0, 0)
  let id = 0
  let token = 0
  const codes = ['ABCD', 'EFGH', 'MNPQ']
  const manager = new RoomManager({
    now: () => timestamp,
    createId: () => `id-${++id}`,
    createToken: () => `token-${++token}`,
    createCode: () => codes.shift() ?? 'RSTU',
  })

  return {
    manager,
    advance: (milliseconds: number) => {
      timestamp += milliseconds
    },
  }
}

function socketSession(session: { roomCode: string; playerId: string }) {
  return { roomCode: session.roomCode, playerId: session.playerId }
}

function expectRoomError(action: () => unknown, code: string) {
  try {
    action()
    throw new Error(`Expected ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(RoomError)
    expect((error as RoomError).code).toBe(code)
  }
}

describe('RoomManager', () => {
  it('creates a unique room containing only its real host', () => {
    const { manager } = createHarness()
    const created = manager.createRoom(HOST, 'host-connection')

    expect(created.room.code).toBe('ABCD')
    expect(created.room.players).toHaveLength(1)
    expect(created.room.players[0]).toMatchObject({
      id: created.session.playerId,
      name: 'Uzair',
      isConnected: true,
    })
    expect(created.room.hostId).toBe(created.session.playerId)
    expect(created.session.sessionToken).toBe('token-1')
  })

  it('joins by a case-insensitive code and rejects duplicate names', () => {
    const { manager } = createHarness()
    const host = manager.createRoom(HOST, 'host-connection')
    const guest = manager.joinRoom(
      { ...GUEST, roomCode: ' a b c d ' },
      'guest-connection',
    )

    expect(guest.room.players.map((player) => player.name)).toEqual(['Uzair', 'Alex'])
    expect(manager.inspectRoom('abcd')).toEqual({
      code: 'ABCD',
      playerCount: 2,
      maxPlayers: 8,
    })
    expectRoomError(
      () =>
        manager.joinRoom(
          { ...GUEST, name: 'alex', roomCode: host.room.code },
          'duplicate-connection',
        ),
      'NAME_TAKEN',
    )
  })

  it('enforces capacity after a host changes the room size', () => {
    const { manager } = createHarness()
    const host = manager.createRoom(HOST, 'host-connection')
    manager.updateSettings(socketSession(host.session), 'host-connection', {
      ...host.room.settings,
      maxPlayers: 4,
    })

    for (let index = 0; index < 3; index += 1) {
      manager.joinRoom(
        {
          ...GUEST,
          name: `Guest ${index}`,
          roomCode: host.room.code,
        },
        `guest-${index}`,
      )
    }

    expectRoomError(
      () =>
        manager.joinRoom(
          { ...GUEST, name: 'One Too Many', roomCode: host.room.code },
          'extra-guest',
        ),
      'ROOM_FULL',
    )
  })

  it('keeps room settings host-only without a shared ready state', () => {
    const { manager } = createHarness()
    const host = manager.createRoom(HOST, 'host-connection')
    const guest = manager.joinRoom(
      { ...GUEST, roomCode: host.room.code },
      'guest-connection',
    )

    expect(guest.room.players[0]).not.toHaveProperty('isReady')
    expect(guest.room.settings).not.toHaveProperty('requireReady')

    expectRoomError(
      () =>
        manager.updateSettings(socketSession(guest.session), 'guest-connection', {
          ...guest.room.settings,
          allowLateJoin: true,
        }),
      'HOST_ONLY',
    )

    const updated = manager.updateSettings(socketSession(host.session), 'host-connection', {
      ...guest.room.settings,
      allowLateJoin: true,
    })
    expect(updated.settings.allowLateJoin).toBe(true)
  })

  it('restores the same player after a temporary disconnect', () => {
    const { manager } = createHarness()
    const host = manager.createRoom(HOST, 'host-connection')
    const disconnected = manager.disconnect(
      socketSession(host.session),
      'host-connection',
    )

    expect(disconnected?.becameDisconnected).toBe(true)
    expect(disconnected?.room.players[0].isConnected).toBe(false)

    const restored = manager.reconnect(host.session, 'new-host-connection')
    expect(restored.players).toHaveLength(1)
    expect(restored.players[0]).toMatchObject({
      id: host.session.playerId,
      isConnected: true,
    })
    expect(manager.removeDisconnectedPlayer(host.room.code, host.session.playerId)).toBeNull()
  })

  it('retains disconnected match players and migrates the host after the grace period', () => {
    const { manager, advance } = createHarness()
    const host = manager.createRoom(HOST, 'host-connection')
    const guest = manager.joinRoom({ ...GUEST, roomCode: host.room.code }, 'guest-connection')
    manager.openGameSelection(socketSession(host.session), 'host-connection')
    manager.selectGame(socketSession(host.session), 'host-connection', 'property_game')
    manager.startSelectedGame(socketSession(host.session), 'host-connection')
    manager.disconnect(socketSession(host.session), 'host-connection')
    advance(30_000)
    const retained = manager.removeDisconnectedPlayer(host.room.code, host.session.playerId)
    expect(retained?.retained).toBe(true)
    expect(retained?.room?.players).toHaveLength(2)
    expect(retained?.room?.hostId).toBe(guest.session.playerId)
    const restored = manager.reconnect(host.session, 'returned-host-connection')
    expect(restored.players.find((player) => player.id === host.session.playerId)?.isConnected).toBe(true)
    expect(restored.status).toBe('PLAYING')
  })

  it('rejects a forged reconnection token', () => {
    const { manager } = createHarness()
    const host = manager.createRoom(HOST, 'host-connection')

    expectRoomError(
      () => manager.reconnect({ ...host.session, sessionToken: 'forged' }, 'attacker'),
      'SESSION_INVALID',
    )
  })

  it('transfers host control and revokes privileged access from the old host', () => {
    const { manager } = createHarness()
    const host = manager.createRoom(HOST, 'host-connection')
    const guest = manager.joinRoom(
      { ...GUEST, roomCode: host.room.code },
      'guest-connection',
    )
    const transferred = manager.transferHost(
      socketSession(host.session),
      'host-connection',
      guest.session.playerId,
    )

    expect(transferred.hostId).toBe(guest.session.playerId)
    expectRoomError(
      () =>
        manager.updateSettings(socketSession(host.session), 'host-connection', {
          ...transferred.settings,
          filterNames: false,
        }),
      'HOST_ONLY',
    )
  })

  it('removes a kicked player and invalidates their session', () => {
    const { manager } = createHarness()
    const host = manager.createRoom(HOST, 'host-connection')
    const guest = manager.joinRoom(
      { ...GUEST, roomCode: host.room.code },
      'guest-connection',
    )
    const removal = manager.kickPlayer(
      socketSession(host.session),
      'host-connection',
      guest.session.playerId,
    )

    expect(removal.removedConnectionIds).toEqual(['guest-connection'])
    expect(removal.room?.players.map((player) => player.name)).toEqual(['Uzair'])
    expectRoomError(
      () => manager.reconnect(guest.session, 'returning-guest'),
      'SESSION_INVALID',
    )
  })

  it('opens game selection without a lobby ready check and rejects retired games', () => {
    const { manager } = createHarness()
    const host = manager.createRoom(HOST, 'host-connection')
    const selection = manager.openGameSelection(
      socketSession(host.session),
      'host-connection',
    )
    expect(selection).toMatchObject({ status: 'GAME_SELECT', selectedGameId: null })

    expectRoomError(
      () =>
        manager.selectGame(
          socketSession(host.session),
          'host-connection',
          'FOUR_CHOICE',
        ),
      'INVALID_INPUT',
    )
  })

  it('lets only the host return from game selection to the lobby', () => {
    const { manager } = createHarness()
    const host = manager.createRoom(HOST, 'host-connection')
    const guest = manager.joinRoom(
      { ...GUEST, roomCode: host.room.code },
      'guest-connection',
    )
    manager.openGameSelection(socketSession(host.session), 'host-connection')

    expectRoomError(
      () => manager.returnToLobby(socketSession(guest.session), 'guest-connection'),
      'HOST_ONLY',
    )

    const lobby = manager.returnToLobby(socketSession(host.session), 'host-connection')
    expect(lobby).toMatchObject({ status: 'WAITING', selectedGameId: null })
  })

  it('moves host control after grace expiry and deletes an empty room', () => {
    const { manager } = createHarness()
    const host = manager.createRoom(HOST, 'host-connection')
    const guest = manager.joinRoom(
      { ...GUEST, roomCode: host.room.code },
      'guest-connection',
    )

    manager.disconnect(socketSession(host.session), 'host-connection')
    const hostRemoval = manager.removeDisconnectedPlayer(host.room.code, host.session.playerId)
    expect(hostRemoval?.newHostName).toBe('Alex')
    expect(hostRemoval?.room?.hostId).toBe(guest.session.playerId)

    manager.disconnect(socketSession(guest.session), 'guest-connection')
    const lastRemoval = manager.removeDisconnectedPlayer(host.room.code, guest.session.playerId)
    expect(lastRemoval?.roomClosed).toBe(true)
    expectRoomError(() => manager.inspectRoom(host.room.code), 'ROOM_NOT_FOUND')
  })

  it('expires inactive rooms and closes rooms explicitly', () => {
    const harness = createHarness()
    const first = harness.manager.createRoom(HOST, 'first-host')
    harness.advance(ROOM_INACTIVITY_MS)

    expect(harness.manager.expireInactiveRooms()).toEqual([
      { code: first.room.code, connectionIds: ['first-host'] },
    ])

    const second = harness.manager.createRoom(HOST, 'second-host')
    expect(
      harness.manager.closeRoom(socketSession(second.session), 'second-host').connectionIds,
    ).toEqual(['second-host'])
    expectRoomError(() => harness.manager.inspectRoom(second.room.code), 'ROOM_NOT_FOUND')
  })
})
