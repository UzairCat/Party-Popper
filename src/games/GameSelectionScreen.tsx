import type { CSSProperties } from 'react'
import { GAME_CATALOG, type GameId } from '../../shared/games'
import { Button } from '../components/common/Button'
import { getAvatarEmoji, getColourHex } from '../data/playerOptions'
import type { RoomSnapshot } from '../types/room'

interface GameSelectionScreenProps {
  room: RoomSnapshot
  currentPlayerId: string
  isPending: boolean
  onSelect: (gameId: GameId) => void
  onBackToLobby: () => void
  onLeave: () => void
}

export function GameSelectionScreen({
  room,
  currentPlayerId,
  isPending,
  onSelect,
  onBackToLobby,
  onLeave,
}: GameSelectionScreenProps) {
  const isHost = room.hostId === currentPlayerId
  const connectedPlayers = room.players.filter((player) => player.isConnected)

  return (
    <section className="game-select-page page-enter">
      <header className="game-stage-header">
        <div>
          <p className="eyebrow eyebrow--accent">Room {room.code}</p>
          <h1>Choose the next game</h1>
          <p>
            {isHost
              ? 'Pick a game, then configure it before anyone starts playing.'
              : 'The host is choosing a game for the room.'}
          </p>
        </div>
        <div className="game-stage-header__actions">
          {isHost ? (
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={onBackToLobby}
            >
              Back to lobby
            </Button>
          ) : null}
          <Button type="button" variant="quiet" disabled={isPending} onClick={onLeave}>
            Leave room
          </Button>
        </div>
      </header>

      <div className="room-party-strip" aria-label={`${connectedPlayers.length} connected players`}>
        <div className="room-party-strip__avatars" aria-hidden="true">
          {room.players.map((player) => (
            <span
              key={player.id}
              className={!player.isConnected ? 'is-away' : ''}
              style={{ '--player-colour': getColourHex(player.colour) } as CSSProperties}
            >
              {getAvatarEmoji(player.avatar)}
            </span>
          ))}
        </div>
        <div>
          <strong>{connectedPlayers.length} players connected</strong>
          <span>{isHost ? 'You control game selection' : 'Changes appear here instantly'}</span>
        </div>
      </div>

      <div className="game-library-heading">
        <div>
          <p className="eyebrow">Party Popper games</p>
          <h2>Game selection</h2>
        </div>
        {!isHost ? <span className="host-control-note">Host controls</span> : null}
      </div>

      <div className="game-card-grid">
        {GAME_CATALOG.map((game) => (
          <article className="game-card game-card--four-choice" key={game.id}>
            <div className="game-card__art" aria-hidden="true">
              <span>A</span>
              <span>B</span>
              <span>C</span>
              <span>D</span>
              <strong>?</strong>
            </div>
            <div className="game-card__body">
              <span className="game-card__type">{game.type}</span>
              <h3>{game.shortName}</h3>
              <p>{game.description}</p>
              <dl className="game-card__facts">
                <div>
                  <dt>Players</dt>
                  <dd>{game.minimumPlayers}–{game.maximumPlayers}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{game.estimatedDuration}</dd>
                </div>
              </dl>
              {isHost ? (
                <Button
                  type="button"
                  size="large"
                  disabled={isPending}
                  onClick={() => onSelect(game.id)}
                >
                  Select game <span aria-hidden="true">→</span>
                </Button>
              ) : (
                <div className="game-card__waiting" role="status">
                  <span aria-hidden="true">…</span>
                  Waiting for host
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
