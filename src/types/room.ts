export type PlayerColour =
  | 'coral'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'purple'
  | 'orange'
  | 'pink'
  | 'cyan'

export type PlayerAvatar =
  | 'robot'
  | 'frog'
  | 'alien'
  | 'cool'
  | 'cowboy'
  | 'cat'
  | 'monkey'
  | 'sparkle'

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

export interface LobbyNavigationState {
  mode: 'host' | 'guest'
  name: string
  avatar: PlayerAvatar
  colour: PlayerColour
}
