import type { FourChoiceSettings, FourChoiceSetupSnapshot, QuizSnapshot } from './four-choice.js'
import type { GameId } from './games.js'

export const ROOM_CODE_LENGTH = 4
export const ROOM_CODE_CHARACTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const DISPLAY_NAME_MIN_LENGTH = 2
export const DISPLAY_NAME_MAX_LENGTH = 16
export const MAX_PLAYER_OPTIONS = [4, 6, 8, 10, 12] as const
export const DISCONNECT_GRACE_MS = 30_000
export const ROOM_INACTIVITY_MS = 30 * 60 * 1000

export const PLAYER_COLOUR_IDS = [
  'coral',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
  'pink',
  'cyan',
] as const

export const PLAYER_AVATAR_IDS = [
  'robot',
  'frog',
  'alien',
  'cool',
  'cowboy',
  'cat',
  'monkey',
  'sparkle',
] as const

export type PlayerColour = (typeof PLAYER_COLOUR_IDS)[number]
export type PlayerAvatar = (typeof PLAYER_AVATAR_IDS)[number]
export type RoomStatus = 'WAITING' | 'GAME_SELECT' | 'GAME_SETUP' | 'PLAYING' | 'CLOSED'

export interface Player {
  id: string
  name: string
  avatar: PlayerAvatar
  colour: PlayerColour
  isReady: boolean
  isConnected: boolean
}

export interface RoomSettings {
  maxPlayers: number
  requireReady: boolean
  allowLateJoin: boolean
  filterNames: boolean
}

export interface RoomSnapshot {
  code: string
  status: RoomStatus
  selectedGameId: GameId | null
  hostId: string
  players: Player[]
  settings: RoomSettings
  createdAt: string
  updatedAt: string
}

export interface SessionCredentials {
  roomCode: string
  playerId: string
  sessionToken: string
}

export interface PlayerIdentityInput {
  name: string
  avatar: PlayerAvatar
  colour: PlayerColour
}

export interface JoinRoomInput extends PlayerIdentityInput {
  roomCode: string
}

export interface RoomSummary {
  code: string
  playerCount: number
  maxPlayers: number
}

export interface SessionResponse {
  session: SessionCredentials
  room: RoomSnapshot
}

export type RoomErrorCode =
  | 'INVALID_INPUT'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'GAME_STARTED'
  | 'NAME_TAKEN'
  | 'SESSION_INVALID'
  | 'HOST_ONLY'
  | 'PLAYER_NOT_FOUND'
  | 'MIN_PLAYERS'
  | 'PLAYERS_NOT_READY'
  | 'INVALID_GAME_STATE'
  | 'NO_CATEGORIES'
  | 'ALREADY_IN_ROOM'
  | 'INTERNAL_ERROR'

export interface RoomErrorPayload {
  code: RoomErrorCode
  message: string
}

export type AckResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: RoomErrorPayload }

export interface RoomNotice {
  message: string
}

export interface ClientToServerEvents {
  'room:inspect': (
    payload: { roomCode: string },
    acknowledge: (response: AckResponse<RoomSummary>) => void,
  ) => void
  'room:create': (
    payload: PlayerIdentityInput,
    acknowledge: (response: AckResponse<SessionResponse>) => void,
  ) => void
  'room:join': (
    payload: JoinRoomInput,
    acknowledge: (response: AckResponse<SessionResponse>) => void,
  ) => void
  'room:reconnect': (
    payload: SessionCredentials,
    acknowledge: (response: AckResponse<RoomSnapshot>) => void,
  ) => void
  'player:ready': (
    payload: { isReady: boolean },
    acknowledge: (response: AckResponse<RoomSnapshot>) => void,
  ) => void
  'settings:update': (
    payload: { settings: RoomSettings },
    acknowledge: (response: AckResponse<RoomSnapshot>) => void,
  ) => void
  'player:kick': (
    payload: { playerId: string },
    acknowledge: (response: AckResponse<RoomSnapshot>) => void,
  ) => void
  'host:transfer': (
    payload: { playerId: string },
    acknowledge: (response: AckResponse<RoomSnapshot>) => void,
  ) => void
  'room:leave': (
    acknowledge: (response: AckResponse<{ roomClosed: boolean }>) => void,
  ) => void
  'room:close': (
    acknowledge: (response: AckResponse<{ roomClosed: true }>) => void,
  ) => void
  'games:open': (
    acknowledge: (response: AckResponse<RoomSnapshot>) => void,
  ) => void
  'game:select': (
    payload: { gameId: GameId },
    acknowledge: (response: AckResponse<RoomSnapshot>) => void,
  ) => void
  'game:back': (
    acknowledge: (response: AckResponse<RoomSnapshot>) => void,
  ) => void
  'game:return-to-lobby': (
    acknowledge: (response: AckResponse<RoomSnapshot>) => void,
  ) => void
  'quiz:settings:get': (
    acknowledge: (response: AckResponse<FourChoiceSetupSnapshot>) => void,
  ) => void
  'quiz:settings:update': (
    payload: { settings: FourChoiceSettings },
    acknowledge: (response: AckResponse<FourChoiceSetupSnapshot>) => void,
  ) => void
  'quiz:start': (
    acknowledge: (response: AckResponse<RoomSnapshot>) => void,
  ) => void
  'quiz:sync': (acknowledge: (response: AckResponse<QuizSnapshot>) => void) => void
  'quiz:answer': (payload: { questionId: string; answer: number }, acknowledge: (response: AckResponse<QuizSnapshot>) => void) => void
  'quiz:next': (acknowledge: (response: AckResponse<QuizSnapshot>) => void) => void
  'quiz:menu': (acknowledge: (response: AckResponse<RoomSnapshot>) => void) => void
}

export interface ServerToClientEvents {
  'room:state': (room: RoomSnapshot) => void
  'room:notice': (notice: RoomNotice) => void
  'room:closed': (notice: RoomNotice) => void
  'player:kicked': (notice: RoomNotice) => void
  'session:ended': (notice: RoomNotice) => void
  'quiz:state': (setup: FourChoiceSetupSnapshot) => void
  'quiz:match': (state: QuizSnapshot) => void
}

export type InterServerEvents = Record<string, never>

export interface SocketSession {
  roomCode: string
  playerId: string
}

export interface SocketData {
  session?: SocketSession
}
