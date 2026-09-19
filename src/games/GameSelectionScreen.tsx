import type { CSSProperties } from 'react'
import { GAME_CATALOG, type GameId } from '../../shared/games'
import { Button } from '../components/common/Button'
import { getColourHex } from '../data/playerOptions'
import { AvatarArt } from '../components/player/AvatarArt'
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
              <AvatarArt avatar={player.avatar} />
            </span>
          ))}
        </div>
        <div>
          <strong>
            {connectedPlayers.length} {connectedPlayers.length === 1 ? 'player' : 'players'} connected
          </strong>
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

      {GAME_CATALOG.length ? (
        <div className="game-card-grid">
          {GAME_CATALOG.map((game, index) => (
            <article className={`game-card ${game.id === 'property_game' ? 'game-card--own-it' : ''}`} key={game.id}>
              <div className="game-card__art" aria-hidden="true">
                {game.id === 'property_game' ? <div className="oi-library-art"><span>01 / THE ESTATE</span><div className="oi-library-art__board"><i>⌂</i><i>$</i><i>⚄</i><strong>OWN<br />IT!</strong><i>★</i><i>▰</i><i>♛</i></div><small>EVERY SQUARE IS AN OPPORTUNITY.</small></div> : <><span>{String(index + 1).padStart(2, '0')}</span><strong>{game.shortName.slice(0, 1)}</strong><i>✦</i></>}
              </div>
              <div className="game-card__body">
                <span className="game-card__type">{game.type}</span>
                <h3>{game.shortName}</h3>
                <p>{game.description}</p>
                <dl className="game-card__facts">
                  <div><dt>Players</dt><dd>{game.minimumPlayers}–{game.maximumPlayers}</dd></div>
                  <div><dt>Duration</dt><dd>{game.estimatedDuration}</dd></div>
                </dl>
                {isHost ? (
                  <Button type="button" size="large" disabled={isPending} onClick={() => onSelect(game.id)}>
                    Select game <span aria-hidden="true">→</span>
                  </Button>
                ) : <span className="host-control-note">Waiting for the host</span>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="game-library-empty" role="status">
          <div className="game-library-empty__art" aria-hidden="true">
            <span>✦</span>
            <span>+</span>
            <span>★</span>
          </div>
          <p className="eyebrow eyebrow--accent">The workshop is open</p>
          <h3>New party packs are on the way.</h3>
          <p>
            There are no playable games in the pack just yet. Each future game will bring its
            own setup, player requirements, and ready check here.
          </p>
          {isHost ? (
            <Button type="button" variant="secondary" disabled={isPending} onClick={onBackToLobby}>
              Return to lobby
            </Button>
          ) : (
            <span className="host-control-note">Waiting for the host</span>
          )}
        </div>
      )}
    </section>
  )
}
