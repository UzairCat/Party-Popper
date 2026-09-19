import { memo, useEffect, useState, type CSSProperties } from 'react'
import { getOwnableTiles, getPropertyBoard, PROPERTY_MAPS, type BoardTile, type MatchSnapshot } from '../../../shared/property-game'
import type { RoomSnapshot } from '../../../shared/protocol'
import { AvatarArt } from '../../components/player/AvatarArt'
import { getColourHex } from '../../data/playerOptions'

const tileGlyph: Record<BoardTile['type'], string> = { START: '↗', PROPERTY: '⌂', TRANSPORT: '▰', UTILITY: '⚡', CARD: '✦', TAX: '−', JAIL: '⌗', FREE: '★', GO_TO_JAIL: '↯' }
const money = (value: number) => `$${value.toLocaleString()}`

function coordinates(index: number): CSSProperties {
  if (index <= 10) return { gridRow: 11, gridColumn: 11 - index }
  if (index <= 20) return { gridRow: 21 - index, gridColumn: 1 }
  if (index <= 30) return { gridRow: 1, gridColumn: index - 19 }
  return { gridRow: index - 29, gridColumn: 11 }
}

function CardReveal({ match }: { match: MatchSnapshot }) {
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const [clock, setClock] = useState(Date.now)
  useEffect(() => {
    const drawnAt = match.lastCardAt
    if (!drawnAt) return
    const remaining = Math.max(0, 9000 - (Date.now() - drawnAt))
    const timer = window.setTimeout(() => setClock(Date.now()), remaining)
    return () => window.clearTimeout(timer)
  }, [match.lastCardAt])
  if (!match.lastCardAt || clock >= match.lastCardAt + 9000 || !match.lastCard || !match.lastCardPlayerId || dismissedAt === match.lastCardAt) return null
  const player = match.players[match.lastCardPlayerId]
  if (!player) return null
  return <div className={`oi-board-card oi-board-card--${match.lastCard.deck}`} style={{ '--card-player-color': getColourHex(player.colour) } as CSSProperties} role="status" aria-live="polite">
    <div className="oi-board-card__mast"><span>{match.lastCard.deck === 'event' ? '✦ CHANCE' : '▣ COMMUNITY CHEST'}</span><span>#{match.lastCard.id.toUpperCase()}</span></div>
    <span className="oi-board-card__seal" aria-hidden="true">{match.lastCard.deck === 'event' ? '✦' : '♧'}</span>
    <span className="oi-board-card__who"><span style={{ background: getColourHex(player.colour) }}><AvatarArt avatar={player.avatar} /></span>{player.name} drew a card</span>
    <strong>{match.lastCard.text}</strong>
    <button type="button" onClick={() => setDismissedAt(match.lastCardAt)}>Got it ×</button>
  </div>
}

export const OwnItBoard = memo(function OwnItBoard({ match, room, tokenPositions, onTileClick }: { match: MatchSnapshot; room: RoomSnapshot; tokenPositions: Record<string, number>; onTileClick: (tile: BoardTile) => void }) {
  const board = getPropertyBoard(match.settings.mapId)
  const owned = getOwnableTiles(match.settings.mapId).filter((tile) => match.properties[tile.index].ownerId).length
  const standing = match.order.filter((id) => !match.players[id].bankrupt).length
  return <div className={`oi-board oi-board--${match.settings.mapId}`} role="grid" aria-label={`${PROPERTY_MAPS[match.settings.mapId].name} Own It! game board`}>
    {board.map((tile) => {
      const holding = match.properties[tile.index]
      const owner = holding?.ownerId ? match.players[holding.ownerId] : null
      const tokens = room.players.filter((player) => match.players[player.id] && !match.players[player.id].bankrupt && (tokenPositions[player.id] ?? match.players[player.id].position) === tile.index)
      return <button key={tile.index} type="button" className={`oi-tile oi-tile--${tile.type.toLowerCase()} ${tile.group ? `oi-tile--${tile.group}` : ''} ${holding?.mortgaged ? 'is-mortgaged' : ''} ${owner ? 'is-owned' : ''}`} style={{ ...coordinates(tile.index), '--owner-color': owner ? getColourHex(owner.colour) : 'transparent' } as CSSProperties} onClick={() => onTileClick(tile)} aria-label={`${tile.name}${owner ? `, owned by ${owner.name}` : ''}${holding?.buildings ? `, ${holding.buildings === 5 ? 'hotel' : `${holding.buildings} houses`}` : ''}`}>
        <span className="oi-tile__ribbon" /><span className="oi-tile__icon" aria-hidden="true">{tileGlyph[tile.type]}</span><span className="oi-tile__name">{tile.name}</span>{tile.region && <span className="oi-tile__region">{tile.region}</span>}{tile.price && <span className="oi-tile__price">{money(tile.price)}</span>}{holding?.buildings > 0 && <span className="oi-tile__build">{holding.buildings === 5 ? '▣ HOTEL' : `⌂ ×${holding.buildings}`}</span>}{holding?.mortgaged && <span className="oi-tile__mortgage">MORTGAGED</span>}{tokens.length > 0 && <span className="oi-tile__tokens">{tokens.map((player) => { const token = match.players[player.id]; return <span key={player.id} title={player.name} style={{ '--player-color': getColourHex(token.colour) } as CSSProperties}><AvatarArt avatar={token.avatar} /></span> })}</span>}
      </button>
    })}
    <div className="oi-board-center">
      <div className="oi-board-center__frame"><span>EST. BY PARTY POPPER</span><span>{PROPERTY_MAPS[match.settings.mapId].name.toUpperCase()} EDITION</span></div>
      <div className="oi-board-center__illustration" aria-hidden="true">{match.settings.mapId === 'south_africa' ? <svg viewBox="0 0 360 220"><path d="M36 87 58 65l35 3 20-32 36 8 27-13 23 26 34-2 34 19 41-10 27 18-19 25 5 23-34 9-9 31-35 4-22 30-39 4-23-19-42 8-23-15-23-5-4-30-26-16Z" fill="#d3b780" stroke="#334b39" strokeWidth="4" strokeLinejoin="round"/><path d="M53 135c52-34 98-28 126-48 29-21 78-24 130 20M73 162c74 12 119 14 188-22" fill="none" stroke="#fef9e8" strokeWidth="3" strokeDasharray="7 8"/><circle cx="62" cy="142" r="7"/><circle cx="202" cy="74" r="7"/><circle cx="284" cy="117" r="7"/></svg> : <svg viewBox="0 0 360 220"><path d="M18 181h324M40 181V74h52v107M98 181V55h64v126M165 181V91h57v90M230 181V38h52v143M291 181v-82h39v82" fill="#d9c58e" stroke="#2b4836" strokeWidth="4"/><path d="M113 55V25h33v30M245 38V17h23v21" fill="#e99b67" stroke="#2b4836" strokeWidth="4"/><path d="M58 94h15m-15 23h15m-15 23h15m43-62h28m-28 24h28m-28 24h28m72-8h22m-22 23h22m30-76h18m-18 26h18m-18 26h18" stroke="#fff6dc" strokeWidth="6"/></svg>}</div>
      <div className="oi-board-center__brand"><span>THE PROPERTY TRADING GAME</span><strong>OWN <em>IT!</em></strong><small>{match.settings.mapId === 'south_africa' ? 'A country of opportunity.' : 'Every square is an opportunity.'}</small></div>
      <div className="oi-board-center__stats"><span><strong>{owned}</strong> DEEDS CLAIMED</span><span><strong>{standing}</strong> PLAYERS STANDING</span></div>
      <CardReveal match={match} />
    </div>
  </div>
})
