export const ROOM_CODE_LENGTH = 4
const ROOM_CODE_CHARACTERS = /[^A-HJ-KM-NP-Z2-9]/g

export function normaliseRoomCode(value: string) {
  return value
    .toUpperCase()
    .replace(/\s/g, '')
    .replace(ROOM_CODE_CHARACTERS, '')
    .slice(0, ROOM_CODE_LENGTH)
}

export function validateDisplayName(value: string) {
  const name = value.trim()

  if (!name) {
    return 'Enter a name first.'
  }

  if (name.length < 2) {
    return 'Use at least 2 characters.'
  }

  if (name.length > 16) {
    return 'Keep your name to 16 characters.'
  }

  return null
}
