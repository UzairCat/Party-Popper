import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/common/Button'
import { IdentityPicker } from '../components/player/IdentityPicker'
import { inspectRoom, joinRoom } from '../lib/socket'
import { saveSession } from '../lib/session'
import { normaliseRoomCode, ROOM_CODE_LENGTH, validateDisplayName } from '../lib/validation'
import type { PlayerAvatar, PlayerColour } from '../types/room'

type JoinStep = 'code' | 'identity'

export function JoinRoomPage() {
  const navigate = useNavigate()
  const { roomCode: routeRoomCode } = useParams()
  const directRoomCode = useMemo(
    () => normaliseRoomCode(routeRoomCode ?? ''),
    [routeRoomCode],
  )
  const hasDirectCode = directRoomCode.length === ROOM_CODE_LENGTH
  const [step, setStep] = useState<JoinStep>(hasDirectCode ? 'identity' : 'code')
  const [roomCode, setRoomCode] = useState(directRoomCode)
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<PlayerAvatar>('frog')
  const [colour, setColour] = useState<PlayerColour>('green')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleCodeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return

    if (roomCode.length !== ROOM_CODE_LENGTH) {
      setError('Enter the 4-character room code.')
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      const response = await inspectRoom(roomCode)

      if (!response.ok) {
        setError(response.error.message)
        return
      }

      setRoomCode(response.data.code)
      setStep('identity')
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Could not check that room. Try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleJoinSubmit = async (event: FormEvent<HTMLFormElement>) => {
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
      const response = await joinRoom({
        roomCode,
        name: name.trim(),
        avatar,
        colour,
      })

      if (!response.ok) {
        setError(response.error.message)
        setIsSubmitting(false)
        return
      }

      saveSession(response.data.session)
      navigate(`/room/${response.data.room.code}`)
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Could not join the room. Try again.',
      )
      setIsSubmitting(false)
    }
  }

  return (
    <section className="form-page form-page--narrow page-enter">
      {step === 'code' ? (
        <Link className="back-link" to="/">
          <span aria-hidden="true">←</span> Home
        </Link>
      ) : (
        <button
          className="back-link back-link--button"
          type="button"
          onClick={() => {
            if (hasDirectCode) {
              navigate('/')
            } else {
              setStep('code')
              setError(null)
            }
          }}
        >
          <span aria-hidden="true">←</span> {hasDirectCode ? 'Home' : 'Room code'}
        </button>
      )}

      <div className="form-card">
        {step === 'code' ? (
          <>
            <div className="form-card__heading form-card__heading--centered">
              <div className="heading-icon" aria-hidden="true">
                #
              </div>
              <p className="eyebrow eyebrow--accent">Got an invite?</p>
              <h1>Join a room</h1>
              <p>Enter the code shown on the host’s screen.</p>
            </div>

            <form onSubmit={handleCodeSubmit} noValidate>
              <div className="field field--code">
                <label htmlFor="room-code">Room code</label>
                <input
                  id="room-code"
                  name="roomCode"
                  type="text"
                  value={roomCode}
                  maxLength={ROOM_CODE_LENGTH}
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoFocus
                  placeholder="J7KQ"
                  aria-describedby={error ? 'room-code-error' : 'room-code-hint'}
                  aria-invalid={Boolean(error)}
                  onChange={(event) => {
                    setRoomCode(normaliseRoomCode(event.target.value))
                    if (error) setError(null)
                  }}
                />
                {error ? (
                  <span className="field__error" id="room-code-error">
                    {error}
                  </span>
                ) : (
                  <span className="field__hint" id="room-code-hint">
                    Letters and numbers only
                  </span>
                )}
              </div>

              <Button type="submit" size="large" isLoading={isSubmitting}>
                Continue <span aria-hidden="true">→</span>
              </Button>
            </form>
          </>
        ) : (
          <>
            <div className="form-card__heading">
              <p className="eyebrow eyebrow--accent">Joining {roomCode}</p>
              <h1>Pick your player</h1>
              <p>You can change your look before you jump in.</p>
            </div>

            <form onSubmit={handleJoinSubmit} noValidate>
              <div className="field">
                <label htmlFor="player-name">What’s your name?</label>
                <input
                  id="player-name"
                  name="name"
                  type="text"
                  value={name}
                  minLength={2}
                  maxLength={16}
                  autoComplete="nickname"
                  autoFocus
                  placeholder="Enter your name"
                  aria-describedby={error ? 'player-name-error' : 'player-name-hint'}
                  aria-invalid={Boolean(error)}
                  onChange={(event) => {
                    setName(event.target.value)
                    if (error) setError(null)
                  }}
                />
                {error ? (
                  <span className="field__error" id="player-name-error">
                    {error}
                  </span>
                ) : (
                  <span className="field__hint" id="player-name-hint">
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
                Join the room <span aria-hidden="true">→</span>
              </Button>
            </form>
          </>
        )}
      </div>
    </section>
  )
}
