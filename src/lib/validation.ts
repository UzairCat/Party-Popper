import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  ROOM_CODE_LENGTH,
} from '../../shared/protocol'

export { ROOM_CODE_LENGTH }
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

  if (name.length < DISPLAY_NAME_MIN_LENGTH) {
    return `Use at least ${DISPLAY_NAME_MIN_LENGTH} characters.`
  }

  if (name.length > DISPLAY_NAME_MAX_LENGTH) {
    return `Keep your name to ${DISPLAY_NAME_MAX_LENGTH} characters.`
  }

  return null
}
