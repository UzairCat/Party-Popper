import type { SessionCredentials } from '../types/room'

const SESSION_STORAGE_KEY = 'party-popper-session'

export function saveSession(session: SessionCredentials) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function loadSession(roomCode?: string): SessionCredentials | null {
  const storedValue = window.localStorage.getItem(SESSION_STORAGE_KEY)
  if (!storedValue) return null

  try {
    const session = JSON.parse(storedValue) as Partial<SessionCredentials>

    if (
      typeof session.roomCode !== 'string' ||
      typeof session.playerId !== 'string' ||
      typeof session.sessionToken !== 'string'
    ) {
      clearSession()
      return null
    }

    if (roomCode && session.roomCode !== roomCode) {
      return null
    }

    return session as SessionCredentials
  } catch {
    clearSession()
    return null
  }
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_STORAGE_KEY)
}
