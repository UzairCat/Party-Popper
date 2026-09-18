import type { PlayerAvatar, PlayerColour } from '../types/room'

interface ColourOption {
  id: PlayerColour
  label: string
  hex: string
}

interface AvatarOption {
  id: PlayerAvatar
  label: string
  emoji: string
}

export const PLAYER_COLOURS: ColourOption[] = [
  { id: 'coral', label: 'Coral', hex: '#f04f6b' },
  { id: 'blue', label: 'Blue', hex: '#4b78ff' },
  { id: 'green', label: 'Green', hex: '#24b47e' },
  { id: 'yellow', label: 'Yellow', hex: '#f1b82d' },
  { id: 'purple', label: 'Purple', hex: '#8b5cf6' },
  { id: 'orange', label: 'Orange', hex: '#f47b35' },
  { id: 'pink', label: 'Pink', hex: '#e958a0' },
  { id: 'cyan', label: 'Cyan', hex: '#16a5b7' },
]

export const PLAYER_AVATARS: AvatarOption[] = [
  { id: 'robot', label: 'Robot', emoji: '🤖' },
  { id: 'frog', label: 'Frog', emoji: '🐸' },
  { id: 'alien', label: 'Alien', emoji: '👽' },
  { id: 'cool', label: 'Cool face', emoji: '😎' },
  { id: 'cowboy', label: 'Cowboy', emoji: '🤠' },
  { id: 'cat', label: 'Cat', emoji: '🐱' },
  { id: 'monkey', label: 'Monkey', emoji: '🐵' },
  { id: 'sparkle', label: 'Sparkles', emoji: '✨' },
]

export function getAvatarEmoji(avatar: PlayerAvatar) {
  return PLAYER_AVATARS.find((option) => option.id === avatar)?.emoji ?? '🙂'
}

export function getColourHex(colour: PlayerColour) {
  return PLAYER_COLOURS.find((option) => option.id === colour)?.hex ?? '#8b5cf6'
}
