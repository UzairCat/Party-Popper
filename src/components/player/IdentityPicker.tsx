import type { CSSProperties } from 'react'
import { PLAYER_AVATARS, PLAYER_COLOURS } from '../../data/playerOptions'
import type { PlayerAvatar, PlayerColour } from '../../types/room'

interface IdentityPickerProps {
  avatar: PlayerAvatar
  colour: PlayerColour
  onAvatarChange: (avatar: PlayerAvatar) => void
  onColourChange: (colour: PlayerColour) => void
}

export function IdentityPicker({
  avatar,
  colour,
  onAvatarChange,
  onColourChange,
}: IdentityPickerProps) {
  return (
    <div className="identity-picker">
      <fieldset>
        <legend>Pick a player</legend>
        <div className="avatar-options">
          {PLAYER_AVATARS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`avatar-option ${avatar === option.id ? 'is-selected' : ''}`}
              aria-label={option.label}
              aria-pressed={avatar === option.id}
              onClick={() => onAvatarChange(option.id)}
            >
              {option.emoji}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Choose a colour</legend>
        <div className="colour-options">
          {PLAYER_COLOURS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`colour-option ${colour === option.id ? 'is-selected' : ''}`}
              style={{ '--player-colour': option.hex } as CSSProperties}
              aria-label={option.label}
              aria-pressed={colour === option.id}
              onClick={() => onColourChange(option.id)}
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
