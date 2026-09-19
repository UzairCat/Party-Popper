import { useState, type CSSProperties } from 'react'
import { getColourHex } from '../../data/playerOptions'
import { AvatarArt } from './AvatarArt'
import type { Player } from '../../types/room'

interface PlayerCardProps {
  player: Player
  isHost: boolean
  isCurrentPlayer: boolean
  canManage: boolean
  onKick: (player: Player) => void
  onTransferHost: (player: Player) => void
}

export function PlayerCard({
  player,
  isHost,
  isCurrentPlayer,
  canManage,
  onKick,
  onTransferHost,
}: PlayerCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const colour = getColourHex(player.colour)

  return (
    <article
      className={`player-card ${!player.isConnected ? 'is-disconnected' : ''}`}
      style={{ '--player-colour': colour } as CSSProperties}
    >
      <div className="player-card__topline">
        <span className="player-card__avatar" aria-hidden="true">
          <AvatarArt avatar={player.avatar} />
        </span>
        {canManage && !isCurrentPlayer ? (
          <div className="player-menu">
            <button
              className="icon-button"
              type="button"
              aria-label={`Manage ${player.name}`}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              •••
            </button>
            {menuOpen ? (
              <div className="player-menu__popover">
                <button type="button" onClick={() => onTransferHost(player)}>
                  Make host
                </button>
                <button className="is-danger" type="button" onClick={() => onKick(player)}>
                  Remove player
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="player-card__identity">
        <h3>
          {player.name}
          {isCurrentPlayer ? <span className="you-label">You</span> : null}
        </h3>
        {isHost ? <span className="host-badge">♛ Host</span> : null}
      </div>

      <div className="player-card__status">
        {!player.isConnected ? (
          <span className="status-pill status-pill--away">Reconnecting…</span>
        ) : (
          <span className="status-pill status-pill--online">● Connected</span>
        )}
      </div>
    </article>
  )
}
