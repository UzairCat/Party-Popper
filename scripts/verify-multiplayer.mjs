import assert from 'node:assert/strict'
import { io } from 'socket.io-client'

const serverUrl = process.env.PARTY_POPPER_URL ?? 'http://127.0.0.1:3000'
const sockets = []

function connectClient() {
  return new Promise((resolve, reject) => {
    const socket = io(serverUrl, { forceNew: true, reconnection: false })
    const timeout = setTimeout(() => reject(new Error('Socket connection timed out')), 8_000)

    socket.once('connect', () => {
      clearTimeout(timeout)
      sockets.push(socket)
      resolve(socket)
    })
    socket.once('connect_error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })
}

function emitWithAck(socket, event, ...payload) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${event} acknowledgement timed out`)), 8_000)
    socket.emit(event, ...payload, (response) => {
      clearTimeout(timeout)
      resolve(response)
    })
  })
}

function waitForEvent(socket, event, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, handleEvent)
      reject(new Error(`${event} event timed out`))
    }, 8_000)

    const handleEvent = (payload) => {
      if (!predicate(payload)) return
      clearTimeout(timeout)
      socket.off(event, handleEvent)
      resolve(payload)
    }

    socket.on(event, handleEvent)
  })
}

try {
  const hostSocket = await connectClient()
  const guestSocket = await connectClient()
  const created = await emitWithAck(hostSocket, 'room:create', {
    name: 'Host Check',
    avatar: 'robot',
    colour: 'purple',
  })
  assert.equal(created.ok, true)
  assert.equal(created.data.room.players.length, 1)
  assert.equal('isReady' in created.data.room.players[0], false)
  assert.equal('requireReady' in created.data.room.settings, false)

  const roomCode = created.data.room.code
  const hostSession = created.data.session
  const hostSawJoin = waitForEvent(
    hostSocket,
    'room:state',
    (room) => room.players.length === 2,
  )
  const joined = await emitWithAck(guestSocket, 'room:join', {
    roomCode,
    name: 'Guest Check',
    avatar: 'frog',
    colour: 'green',
  })
  assert.equal(joined.ok, true)
  await hostSawJoin

  const guestSession = joined.data.session
  const rejectedGuestOpen = await emitWithAck(guestSocket, 'games:open')
  assert.equal(rejectedGuestOpen.ok, false)
  assert.equal(rejectedGuestOpen.error.code, 'HOST_ONLY')

  const guestSawGameSelection = waitForEvent(
    guestSocket,
    'room:state',
    (room) => room.status === 'GAME_SELECT',
  )
  const openedGames = await emitWithAck(hostSocket, 'games:open')
  assert.equal(openedGames.ok, true)
  assert.equal(openedGames.data.status, 'GAME_SELECT')
  await guestSawGameSelection

  const retiredQuiz = await emitWithAck(hostSocket, 'game:select', {
    gameId: 'FOUR_CHOICE',
  })
  assert.equal(retiredQuiz.ok, false)
  assert.equal(retiredQuiz.error.code, 'INVALID_INPUT')

  const hostSawDisconnect = waitForEvent(
    hostSocket,
    'room:state',
    (room) => !room.players.find((player) => player.id === guestSession.playerId)?.isConnected,
  )
  guestSocket.disconnect()
  await hostSawDisconnect

  const reconnectedGuestSocket = await connectClient()
  const hostSawReconnect = waitForEvent(
    hostSocket,
    'room:state',
    (room) => room.players.find((player) => player.id === guestSession.playerId)?.isConnected,
  )
  const reconnected = await emitWithAck(
    reconnectedGuestSocket,
    'room:reconnect',
    guestSession,
  )
  assert.equal(reconnected.ok, true)
  assert.equal(reconnected.data.players.length, 2)
  assert.equal(reconnected.data.status, 'GAME_SELECT')
  await hostSawReconnect

  const transferred = await emitWithAck(hostSocket, 'host:transfer', {
    playerId: guestSession.playerId,
  })
  assert.equal(transferred.ok, true)
  assert.equal(transferred.data.hostId, guestSession.playerId)

  const hostSawLobby = waitForEvent(
    hostSocket,
    'room:state',
    (room) => room.status === 'WAITING',
  )
  const returned = await emitWithAck(reconnectedGuestSocket, 'game:return-to-lobby')
  assert.equal(returned.ok, true)
  await hostSawLobby

  const hostClosedNotice = waitForEvent(hostSocket, 'room:closed')
  const closed = await emitWithAck(reconnectedGuestSocket, 'room:close')
  assert.equal(closed.ok, true)
  await hostClosedNotice

  assert.notEqual(hostSession.sessionToken, guestSession.sessionToken)
  console.log(`Multiplayer verification passed for room ${roomCode}`)
} finally {
  for (const socket of sockets) socket.disconnect()
}
