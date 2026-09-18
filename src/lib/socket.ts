import { io, type Socket } from 'socket.io-client'
import type {
  AckResponse,
  ClientToServerEvents,
  JoinRoomInput,
  PlayerIdentityInput,
  RoomSnapshot,
  RoomSummary,
  RoomSettings,
  ServerToClientEvents,
  SessionCredentials,
  SessionResponse,
} from '../../shared/protocol'

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  autoConnect: false,
})

let pendingConnection: Promise<void> | null = null

export function ensureSocketConnected() {
  if (socket.connected) return Promise.resolve()
  if (pendingConnection) return pendingConnection

  pendingConnection = new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('The server took too long to respond. Try again.'))
    }, 10_000)

    const handleConnect = () => {
      cleanup()
      resolve()
    }

    const handleError = () => {
      cleanup()
      reject(new Error('Could not connect to the game server. Try again.'))
    }

    const cleanup = () => {
      window.clearTimeout(timeout)
      socket.off('connect', handleConnect)
      socket.off('connect_error', handleError)
      pendingConnection = null
    }

    socket.once('connect', handleConnect)
    socket.once('connect_error', handleError)
    socket.connect()
  })

  return pendingConnection
}

export function disconnectSocket() {
  socket.disconnect()
}

function waitForAck<T>(emit: (acknowledge: (response: AckResponse<T>) => void) => void) {
  return new Promise<AckResponse<T>>((resolve) => {
    const timeout = window.setTimeout(() => {
      resolve({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'The server took too long to respond. Try again.',
        },
      })
    }, 10_000)

    emit((response) => {
      window.clearTimeout(timeout)
      resolve(response)
    })
  })
}

export async function inspectRoom(roomCode: string) {
  await ensureSocketConnected()
  return waitForAck<RoomSummary>((acknowledge) =>
    socket.emit('room:inspect', { roomCode }, acknowledge),
  )
}

export async function createRoom(input: PlayerIdentityInput) {
  await ensureSocketConnected()
  return waitForAck<SessionResponse>((acknowledge) =>
    socket.emit('room:create', input, acknowledge),
  )
}

export async function joinRoom(input: JoinRoomInput) {
  await ensureSocketConnected()
  return waitForAck<SessionResponse>((acknowledge) =>
    socket.emit('room:join', input, acknowledge),
  )
}

export async function reconnectRoom(session: SessionCredentials) {
  await ensureSocketConnected()
  return waitForAck<RoomSnapshot>((acknowledge) =>
    socket.emit('room:reconnect', session, acknowledge),
  )
}

export function updateReady(isReady: boolean) {
  return waitForAck<RoomSnapshot>((acknowledge) =>
    socket.emit('player:ready', { isReady }, acknowledge),
  )
}

export function updateRoomSettings(settings: RoomSettings) {
  return waitForAck<RoomSnapshot>((acknowledge) =>
    socket.emit('settings:update', { settings }, acknowledge),
  )
}

export function kickPlayer(playerId: string) {
  return waitForAck<RoomSnapshot>((acknowledge) =>
    socket.emit('player:kick', { playerId }, acknowledge),
  )
}

export function transferHost(playerId: string) {
  return waitForAck<RoomSnapshot>((acknowledge) =>
    socket.emit('host:transfer', { playerId }, acknowledge),
  )
}

export function leaveRoom() {
  return waitForAck<{ roomClosed: boolean }>((acknowledge) =>
    socket.emit('room:leave', acknowledge),
  )
}

export function closeRoom() {
  return waitForAck<{ roomClosed: true }>((acknowledge) =>
    socket.emit('room:close', acknowledge),
  )
}

export function startGame() {
  return waitForAck<RoomSnapshot>((acknowledge) => socket.emit('game:start', acknowledge))
}
