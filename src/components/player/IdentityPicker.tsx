import type { CSSProperties } from 'react'
import { PLAYER_AVATARS, PLAYER_COLOURS } from '../../data/playerOptions'
import type { PropertyAvatar, PropertyColour } from '../../../shared/property-game'
import { AvatarArt } from './AvatarArt'

interface IdentityPickerProps {
  avatar: PropertyAvatar | null
  colour: PropertyColour | null
  onAvatarChange: (avatar: PropertyAvatar) => void
  onColourChange: (colour: PropertyColour) => void
  disabled?: boolean
}

export function IdentityPicker({
  avatar,
  colour,
  onAvatarChange,
  onColourChange,
  disabled = false,
}: IdentityPickerProps) {
  return (
    <div className="identity-picker">
      <fieldset>
        <legend>Choose your Own It! character</legend>
        <div className="avatar-options">
          {PLAYER_AVATARS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`avatar-option ${avatar === option.id ? 'is-selected' : ''}`}
              aria-label={option.label}
              aria-pressed={avatar === option.id}
              disabled={disabled}
              onClick={() => onAvatarChange(option.id)}
            >
              <AvatarArt avatar={option.id} />
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
              disabled={disabled}
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
