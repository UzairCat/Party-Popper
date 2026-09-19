import type { PropertyAvatar, PropertyColour } from '../../shared/property-game'

interface ColourOption {
  id: PropertyColour
  label: string
  hex: string
}

interface AvatarOption {
  id: PropertyAvatar
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
  { id: 'mint', label: 'Mint', hex: '#66c9a9' },
  { id: 'navy', label: 'Navy', hex: '#304785' },
  { id: 'lavender', label: 'Lavender', hex: '#b198ed' },
  { id: 'red', label: 'Red', hex: '#da5353' },
  { id: 'teal', label: 'Teal', hex: '#008b84' },
  { id: 'gold', label: 'Gold', hex: '#d49b28' },
  { id: 'plum', label: 'Plum', hex: '#a65c92' },
  { id: 'lime', label: 'Lime', hex: '#8dbd42' },
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
  { id: 'fox', label: 'Fox', emoji: '🦊' },
  { id: 'panda', label: 'Panda', emoji: '🐼' },
  { id: 'bear', label: 'Bear', emoji: '🐻' },
  { id: 'penguin', label: 'Penguin', emoji: '🐧' },
  { id: 'ghost', label: 'Ghost', emoji: '👻' },
  { id: 'dragon', label: 'Dragon', emoji: '🐉' },
  { id: 'bee', label: 'Bee', emoji: '🐝' },
  { id: 'astronaut', label: 'Astronaut', emoji: '👨‍🚀' },
]

export function getAvatarEmoji(avatar: PropertyAvatar) {
  return PLAYER_AVATARS.find((option) => option.id === avatar)?.emoji ?? '🙂'
}

export function getColourHex(colour: PropertyColour) {
  return PLAYER_COLOURS.find((option) => option.id === colour)?.hex ?? '#8b5cf6'
}
