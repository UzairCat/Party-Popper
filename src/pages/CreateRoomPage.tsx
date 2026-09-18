import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/common/Button'
import { IdentityPicker } from '../components/player/IdentityPicker'
import { getColourHex } from '../data/playerOptions'
import { AvatarArt } from '../components/player/AvatarArt'
import { createRoom } from '../lib/socket'
import { saveSession } from '../lib/session'
import { validateDisplayName } from '../lib/validation'
import type { PlayerAvatar, PlayerColour } from '../types/room'

export function CreateRoomPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<PlayerAvatar>('robot')
  const [colour, setColour] = useState<PlayerColour>('purple')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return

    const validationError = validateDisplayName(name)

    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      const response = await createRoom({ name: name.trim(), avatar, colour })

      if (!response.ok) {
        setError(response.error.message)
        setIsSubmitting(false)
        return
      }

      saveSession(response.data.session)
      navigate(`/room/${response.data.room.code}`)
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Could not create the room. Try again.',
      )
      setIsSubmitting(false)
    }
  }

  return (
    <section className="form-page page-enter">
      <Link className="back-link" to="/">
        <span aria-hidden="true">←</span> Home
      </Link>

      <div className="form-layout">
        <div className="form-card">
          <div className="form-card__heading">
            <p className="eyebrow eyebrow--accent">You’re the host</p>
            <h1>Create a room</h1>
            <p>Choose how you’ll show up, then invite the group.</p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label htmlFor="host-name">What should we call you?</label>
              <input
                id="host-name"
                name="name"
                type="text"
                value={name}
                minLength={2}
                maxLength={16}
                autoComplete="nickname"
                autoFocus
                placeholder="Enter your name"
                aria-describedby={error ? 'host-name-error' : 'host-name-hint'}
                aria-invalid={Boolean(error)}
                onChange={(event) => {
                  setName(event.target.value)
                  if (error) setError(null)
                }}
              />
              {error ? (
                <span className="field__error" id="host-name-error">
                  {error}
                </span>
              ) : (
                <span className="field__hint" id="host-name-hint">
                  2–16 characters
                </span>
              )}
            </div>

            <IdentityPicker
              avatar={avatar}
              colour={colour}
              onAvatarChange={setAvatar}
              onColourChange={setColour}
            />

            <Button type="submit" size="large" isLoading={isSubmitting}>
              Create room <span aria-hidden="true">→</span>
            </Button>
          </form>
        </div>

        <aside className="identity-preview" aria-label="Player preview">
          <p className="eyebrow">Player preview</p>
          <div
            className="identity-preview__avatar"
            style={{ backgroundColor: getColourHex(colour) }}
            aria-hidden="true"
          >
            <AvatarArt avatar={avatar} />
          </div>
          <strong>{name.trim() || 'Your name'}</strong>
          <span>♛ Host</span>
        </aside>
      </div>
    </section>
  )
}
