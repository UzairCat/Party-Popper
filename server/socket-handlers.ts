import type { Server, Socket } from 'socket.io'
import {
  DISCONNECT_GRACE_MS,
  type AckResponse,
  type ClientToServerEvents,
  type InterServerEvents,
  type RoomErrorPayload,
  type RoomSnapshot,
  type ServerToClientEvents,
  type SocketData,
  type SocketSession,
} from '../shared/protocol.js'
import { FourChoiceManager } from './games/four-choice-manager.js'
import { QuizSessionManager } from './games/quiz-session-manager.js'
import { OpenAIQuizGenerator } from './games/quiz-generator.js'
import { RoomError, RoomManager } from './room-manager.js'

type LobbyServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>

type LobbySocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>

const roomChannel = (roomCode: string) => `room:${roomCode}`
const playerKey = (session: SocketSession) => `${session.roomCode}:${session.playerId}`

function toError(error: unknown): RoomErrorPayload {
  if (error instanceof RoomError) {
    return { code: error.code, message: error.message }
  }

  console.error('Unexpected multiplayer error', error)
  return { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' }
}

function respond<T>(
  acknowledge: (response: AckResponse<T>) => void,
  action: () => T,
): T | null {
  try {
    const data = action()
    acknowledge({ ok: true, data })
    return data
  } catch (error) {
    acknowledge({ ok: false, error: toError(error) })
    return null
  }
}

function respondWith<TAction, TResponse>(
  acknowledge: (response: AckResponse<TResponse>) => void,
  action: () => TAction,
  selectResponse: (result: TAction) => TResponse,
): TAction | null {
  try {
    const result = action()
    acknowledge({ ok: true, data: selectResponse(result) })
    return result
  } catch (error) {
    acknowledge({ ok: false, error: toError(error) })
    return null
  }
}

function requireSession(socket: LobbySocket): SocketSession {
  if (!socket.data.session) {
    throw new RoomError('SESSION_INVALID', 'Reconnect to the room and try again.')
  }

  return socket.data.session
}

export function registerSocketHandlers(
  io: LobbyServer,
  roomManager: RoomManager,
  fourChoiceManager: FourChoiceManager,
  quizManager = new QuizSessionManager(new OpenAIQuizGenerator()),
) {
  const disconnectTimers = new Map<string, NodeJS.Timeout>()

  const clearDisconnectTimer = (session: SocketSession) => {
    const key = playerKey(session)
    const timer = disconnectTimers.get(key)

    if (timer) {
      clearTimeout(timer)
      disconnectTimers.delete(key)
    }
  }

  const broadcastQuiz = (code: string) => {
    if (!quizManager.has(code)) return
    for (const id of io.sockets.adapter.rooms.get(roomChannel(code)) ?? []) {
      const target = io.sockets.sockets.get(id)
      if (target?.data.session) target.emit('quiz:match', quizManager.snapshot(code, target.data.session.playerId))
    }
  }
  quizManager.onChange = broadcastQuiz
  const quizTimer = setInterval(() => quizManager.tick(), 100)
  quizTimer.unref()

  const broadcastState = (room: RoomSnapshot) => {
    quizManager.syncPlayers(room)
    io.to(roomChannel(room.code)).emit('room:state', room)
    broadcastQuiz(room.code)
  }

  const emitSelectedGameState = (socket: LobbySocket, room: RoomSnapshot) => {
    if (room.selectedGameId === 'FOUR_CHOICE') {
      socket.emit('quiz:state', fourChoiceManager.ensureSetup(room.code))
      if (quizManager.has(room.code) && socket.data.session) socket.emit('quiz:match', quizManager.snapshot(room.code, socket.data.session.playerId))
    }
  }

  const removeConnectionsFromRoom = (
    connectionIds: string[],
    roomCode: string,
    event?: { type: 'player:kicked' | 'room:closed' | 'session:ended'; message: string },
  ) => {
    for (const connectionId of connectionIds) {
      const targetSocket = io.sockets.sockets.get(connectionId)
      if (!targetSocket) continue

      if (event) {
        targetSocket.emit(event.type, { message: event.message })
      }

      targetSocket.leave(roomChannel(roomCode))
      targetSocket.data.session = undefined
    }
  }

  io.on('connection', (socket) => {
    socket.on('room:inspect', (payload, acknowledge) => {
      respond(acknowledge, () => roomManager.inspectRoom(payload?.roomCode))
    })

    socket.on('room:create', async (payload, acknowledge) => {
      if (socket.data.session) {
        acknowledge({
          ok: false,
          error: { code: 'ALREADY_IN_ROOM', message: 'Leave your current room first.' },
        })
        return
      }

      const result = respond(acknowledge, () => roomManager.createRoom(payload, socket.id))
      if (!result) return

      socket.data.session = {
        roomCode: result.session.roomCode,
        playerId: result.session.playerId,
      }
      await socket.join(roomChannel(result.room.code))
      broadcastState(result.room)
    })

    socket.on('room:join', async (payload, acknowledge) => {
      if (socket.data.session) {
        acknowledge({
          ok: false,
          error: { code: 'ALREADY_IN_ROOM', message: 'Leave your current room first.' },
        })
        return
      }

      const result = respond(acknowledge, () => roomManager.joinRoom(payload, socket.id))
      if (!result) return

      socket.data.session = {
        roomCode: result.session.roomCode,
        playerId: result.session.playerId,
      }
      await socket.join(roomChannel(result.room.code))
      broadcastState(result.room)
      emitSelectedGameState(socket, result.room)
      socket.to(roomChannel(result.room.code)).emit('room:notice', {
        message: `${payload.name.trim()} joined the room!`,
      })
    })

    socket.on('room:reconnect', async (payload, acknowledge) => {
      if (
        socket.data.session &&
        (socket.data.session.roomCode !== payload?.roomCode ||
          socket.data.session.playerId !== payload?.playerId)
      ) {
        acknowledge({
          ok: false,
          error: { code: 'ALREADY_IN_ROOM', message: 'Leave your current room first.' },
        })
        return
      }

      const wasAlreadyBound = Boolean(socket.data.session)
      const room = respond(acknowledge, () => roomManager.reconnect(payload, socket.id))
      if (!room) return

      socket.data.session = {
        roomCode: payload.roomCode,
        playerId: payload.playerId,
      }
      clearDisconnectTimer(socket.data.session)
      await socket.join(roomChannel(room.code))
      broadcastState(room)
      emitSelectedGameState(socket, room)

      if (!wasAlreadyBound) {
        const player = room.players.find((candidate) => candidate.id === payload.playerId)
        if (player) {
          socket.to(roomChannel(room.code)).emit('room:notice', {
            message: `${player.name} reconnected.`,
          })
        }
      }
    })

    socket.on('player:ready', (payload, acknowledge) => {
      const room = respond(acknowledge, () =>
        roomManager.setReady(requireSession(socket), socket.id, payload?.isReady),
      )
      if (room) broadcastState(room)
    })

    socket.on('settings:update', (payload, acknowledge) => {
      const room = respond(acknowledge, () =>
        roomManager.updateSettings(requireSession(socket), socket.id, payload?.settings),
      )
      if (!room) return

      broadcastState(room)
      socket.to(roomChannel(room.code)).emit('room:notice', {
        message: 'The host updated the room settings.',
      })
    })

    socket.on('player:kick', (payload, acknowledge) => {
      const session = socket.data.session
      const result = respondWith(
        acknowledge,
        () => roomManager.kickPlayer(requireSession(socket), socket.id, payload?.playerId),
        (removal) => {
          if (!removal.room) {
            throw new RoomError('INTERNAL_ERROR', 'The room closed unexpectedly.')
          }
          return removal.room
        },
      )
      if (!result || !session || !result.room) return

      clearDisconnectTimer({ roomCode: session.roomCode, playerId: payload.playerId })
      removeConnectionsFromRoom(result.removedConnectionIds, session.roomCode, {
        type: 'player:kicked',
        message: 'You were removed from the room by the host.',
      })
      broadcastState(result.room)
      io.to(roomChannel(session.roomCode)).emit('room:notice', {
        message: `${result.removedName} was removed from the room.`,
      })
    })

    socket.on('host:transfer', (payload, acknowledge) => {
      const room = respond(acknowledge, () =>
        roomManager.transferHost(requireSession(socket), socket.id, payload?.playerId),
      )
      if (!room) return

      broadcastState(room)
      const nextHost = room.players.find((player) => player.id === room.hostId)
      if (nextHost) {
        io.to(roomChannel(room.code)).emit('room:notice', {
          message: `${nextHost.name} is now the host.`,
        })
      }
    })

    socket.on('room:leave', (acknowledge) => {
      const session = socket.data.session
      const result = respondWith(
        acknowledge,
        () => roomManager.leaveRoom(requireSession(socket), socket.id),
        (removal) => ({ roomClosed: removal.roomClosed }),
      )
      if (!result || !session) return

      clearDisconnectTimer(session)
      removeConnectionsFromRoom(result.removedConnectionIds, session.roomCode, {
        type: 'session:ended',
        message: 'You left the room.',
      })

      if (result.room) {
        broadcastState(result.room)
        io.to(roomChannel(session.roomCode)).emit('room:notice', {
          message: `${result.removedName} left the room.`,
        })
        if (result.newHostName) {
          io.to(roomChannel(session.roomCode)).emit('room:notice', {
            message: `${result.newHostName} is now the host.`,
          })
        }
      } else if (result.roomClosed) {
        fourChoiceManager.removeSetup(session.roomCode)
        quizManager.remove(session.roomCode)
      }
    })

    socket.on('room:close', (acknowledge) => {
      const session = socket.data.session
      const result = respondWith(
        acknowledge,
        () => roomManager.closeRoom(requireSession(socket), socket.id),
        () => ({ roomClosed: true as const }),
      )
      if (!result || !session) return

      fourChoiceManager.removeSetup(session.roomCode)
      quizManager.remove(session.roomCode)
      removeConnectionsFromRoom(result.connectionIds, session.roomCode, {
        type: 'room:closed',
        message: 'The host closed the room.',
      })
    })

    socket.on('games:open', (acknowledge) => {
      const room = respond(acknowledge, () =>
        roomManager.openGameSelection(requireSession(socket), socket.id),
      )
      if (room) broadcastState(room)
    })

    socket.on('game:select', (payload, acknowledge) => {
      const room = respond(acknowledge, () =>
        roomManager.selectGame(requireSession(socket), socket.id, payload?.gameId),
      )
      if (!room) return

      const setup = fourChoiceManager.ensureSetup(room.code)
      broadcastState(room)
      io.to(roomChannel(room.code)).emit('quiz:state', setup)
      io.to(roomChannel(room.code)).emit('room:notice', {
        message: 'Four Choice was selected.',
      })
    })

    socket.on('game:back', (acknowledge) => {
      const room = respond(acknowledge, () =>
        roomManager.returnToGameSelection(requireSession(socket), socket.id),
      )
      if (room) broadcastState(room)
    })

    socket.on('game:return-to-lobby', (acknowledge) => {
      const room = respond(acknowledge, () =>
        roomManager.returnToLobby(requireSession(socket), socket.id),
      )
      if (room) broadcastState(room)
    })

    socket.on('quiz:settings:get', (acknowledge) => {
      const setup = respond(acknowledge, () => {
        const session = requireSession(socket)
        roomManager.getSelectedGame(session, socket.id, 'FOUR_CHOICE')
        return fourChoiceManager.getSetup(session.roomCode)
      })

      if (setup) socket.emit('quiz:state', setup)
    })

    socket.on('quiz:settings:update', (payload, acknowledge) => {
      const setup = respond(acknowledge, () => {
        const session = requireSession(socket)
        const room = roomManager.getSelectedGameAsHost(session, socket.id, 'FOUR_CHOICE')
        if (room.status !== 'GAME_SETUP') throw new RoomError('INVALID_GAME_STATE', 'Settings are locked during a match.')
        return fourChoiceManager.updateSettings(session.roomCode, payload?.settings)
      })
      if (!setup) return

      const session = requireSession(socket)
      io.to(roomChannel(session.roomCode)).emit('quiz:state', setup)
    })

    socket.on('quiz:start', (acknowledge) => {
      const room = respond(acknowledge, () => {
        const session = requireSession(socket)
        const currentRoom = roomManager.startSelectedGame(
          session,
          socket.id,
          'FOUR_CHOICE',
        )
        const setup = fourChoiceManager.validateStart(currentRoom.code)
        quizManager.start(currentRoom, setup.settings)
        return roomManager.setGamePlaying(session, socket.id)
      })

      if (room) broadcastState(room)
    })

    socket.on('quiz:sync', (acknowledge) => {
      respond(acknowledge, () => {
        const session = requireSession(socket)
        roomManager.getSelectedGame(session, socket.id, 'FOUR_CHOICE')
        return quizManager.snapshot(session.roomCode, session.playerId)
      })
    })

    socket.on('quiz:answer', (payload, acknowledge) => {
      respond(acknowledge, () => {
        const session = requireSession(socket)
        roomManager.getSelectedGame(session, socket.id, 'FOUR_CHOICE')
        quizManager.answer(session.roomCode, session.playerId, payload?.questionId, payload?.answer)
        return quizManager.snapshot(session.roomCode, session.playerId)
      })
    })

    socket.on('quiz:next', (acknowledge) => {
      respond(acknowledge, () => {
        const session = requireSession(socket)
        roomManager.getSelectedGameAsHost(session, socket.id, 'FOUR_CHOICE')
        quizManager.next(session.roomCode)
        return quizManager.snapshot(session.roomCode, session.playerId)
      })
    })

    socket.on('quiz:menu', (acknowledge) => {
      const room = respond(acknowledge, () => {
        const session = requireSession(socket)
        roomManager.getSelectedGameAsHost(session, socket.id, 'FOUR_CHOICE')
        quizManager.returnToSettings(session.roomCode)
        return roomManager.finishGame(session, socket.id)
      })
      if (room) {
        broadcastState(room)
        io.to(roomChannel(room.code)).emit('quiz:state', fourChoiceManager.getSetup(room.code))
      }
    })

    socket.on('disconnect', () => {
      const session = socket.data.session
      if (!session) return

      const result = roomManager.disconnect(session, socket.id)
      if (!result?.becameDisconnected) return

      broadcastState(result.room)
      io.to(roomChannel(session.roomCode)).emit('room:notice', {
        message: `${result.playerName} disconnected. Waiting for them to reconnect…`,
      })

      clearDisconnectTimer(session)
      const timer = setTimeout(() => {
        disconnectTimers.delete(playerKey(session))
        const removal = roomManager.removeDisconnectedPlayer(
          session.roomCode,
          session.playerId,
        )
        if (!removal) return

        if (!removal.room) {
          if (removal.roomClosed) {
            fourChoiceManager.removeSetup(session.roomCode)
            quizManager.remove(session.roomCode)
          }
          return
        }

        broadcastState(removal.room)
        io.to(roomChannel(session.roomCode)).emit('room:notice', {
          message: `${removal.removedName} left the room.`,
        })
        if (removal.newHostName) {
          io.to(roomChannel(session.roomCode)).emit('room:notice', {
            message: `${removal.newHostName} is now the host.`,
          })
        }
      }, DISCONNECT_GRACE_MS)
      timer.unref()
      disconnectTimers.set(playerKey(session), timer)
    })
  })

  const cleanupTimer = setInterval(() => {
    for (const expiredRoom of roomManager.expireInactiveRooms()) {
      fourChoiceManager.removeSetup(expiredRoom.code)
      quizManager.remove(expiredRoom.code)
      removeConnectionsFromRoom(expiredRoom.connectionIds, expiredRoom.code, {
        type: 'room:closed',
        message: 'This room closed after being inactive for 30 minutes.',
      })
    }
  }, 60_000)
  cleanupTimer.unref()
  return () => {
    clearInterval(cleanupTimer)
    clearInterval(quizTimer)
    for (const timer of disconnectTimers.values()) clearTimeout(timer)
    disconnectTimers.clear()
  }
}
