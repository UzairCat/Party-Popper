import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { getOwnableTiles, getPropertyBoard, PROPERTY_MAPS, type BoardTile, type MatchSnapshot, type PropertyAction, type TradeAssets, type TradeOffer } from '../../../shared/property-game'
import type { RoomSnapshot } from '../../../shared/protocol'
import { AvatarArt } from '../../components/player/AvatarArt'
import { Button } from '../../components/common/Button'
import { getColourHex } from '../../data/playerOptions'
import { getPropertyMatch, propertyAction, socket } from '../../lib/socket'
import { OwnItBoard } from './OwnItBoard'
import { TabletopDice } from './TabletopDice'
import './own-it.css'

const cash = (amount: number) => `$${Math.max(0, amount).toLocaleString()}`
const worth = (match: MatchSnapshot, playerId: string) => match.players[playerId].cash + getOwnableTiles(match.settings.mapId).reduce((total, tile) => {
  const holding = match.properties[tile.index]
  return total + (holding.ownerId === playerId ? (holding.mortgaged ? tile.mortgage ?? 0 : tile.price ?? 0) + holding.buildings * (tile.buildCost ?? 0) : 0)
}, 0)
const emptyAssets = (): TradeAssets => ({ cash: 0, properties: [], jailCards: [] })
const groupLabels: Record<string, string> = { brown: 'Moss', sky: 'Sky', pink: 'Rose', orange: 'Sunset', red: 'Ruby', yellow: 'Gold', green: 'Green', navy: 'Midnight' }

function AssetList({ match, room, playerId, assets, onChange, title }: { match: MatchSnapshot; room: RoomSnapshot; playerId: string; assets: TradeAssets; onChange: (assets: TradeAssets) => void; title: string }) {
  const player = match.players[playerId]
  const owned = getOwnableTiles(match.settings.mapId).filter((tile) => match.properties[tile.index].ownerId === playerId)
  const toggle = (array: number[] | string[], value: number | string) => array.includes(value as never) ? array.filter((item) => item !== value) : [...array, value]
  return <section className="oi-trade-side"><h3>{title} <small>{room.players.find((entry) => entry.id === playerId)?.name}</small></h3><label>Cash <span>Available {cash(player.cash)}</span><input type="number" min="0" max={player.cash} step="1" value={assets.cash} onChange={(event) => onChange({ ...assets, cash: Math.max(0, Math.min(player.cash, Math.floor(Number(event.target.value) || 0))) })} /></label><div className="oi-asset-list"><strong>Properties</strong>{owned.length ? owned.map((tile) => <label key={tile.index}><input type="checkbox" checked={assets.properties.includes(tile.index)} onChange={() => onChange({ ...assets, properties: toggle(assets.properties, tile.index) as number[] })} /><span className={`oi-group-dot oi-group-${tile.group ?? tile.type.toLowerCase()}`} />{tile.name}{match.properties[tile.index].mortgaged && <small>Mortgaged</small>}</label>) : <p>No properties yet</p>}</div><div className="oi-asset-list"><strong>Jail cards</strong>{player.jailCards.length ? player.jailCards.map((id) => <label key={id}><input type="checkbox" checked={assets.jailCards.includes(id)} onChange={() => onChange({ ...assets, jailCards: toggle(assets.jailCards, id) as string[] })} />Get Out of Jail card</label>) : <p>None</p>}</div></section>
}

function TradeEditor({ match, room, playerId, offer, onClose, onSubmit, pending }: { match: MatchSnapshot; room: RoomSnapshot; playerId: string; offer: TradeOffer | null; onClose: () => void; onSubmit: (action: PropertyAction) => void; pending: boolean }) {
  const defaultTarget = offer ? offer.fromId : match.order.find((id) => id !== playerId && !match.players[id].bankrupt) ?? ''
  const [targetId, setTargetId] = useState(defaultTarget)
  const [give, setGive] = useState<TradeAssets>(offer ? { ...offer.receive, properties: [...offer.receive.properties], jailCards: [...offer.receive.jailCards] } : emptyAssets())
  const [receive, setReceive] = useState<TradeAssets>(offer ? { ...offer.give, properties: [...offer.give.properties], jailCards: [...offer.give.jailCards] } : emptyAssets())
  const valid = targetId && (give.cash > 0 || receive.cash > 0 || give.properties.length > 0 || receive.properties.length > 0 || give.jailCards.length > 0 || receive.jailCards.length > 0)
  return <div className="oi-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div className="oi-modal oi-trade-modal" role="dialog" aria-modal="true" aria-label={offer ? 'Counter trade' : 'Make a trade'}><div className="oi-modal-head"><div><span className="oi-kicker">THE DEAL ROOM</span><h2>{offer ? 'Make a counteroffer' : 'Let’s make a deal.'}</h2></div><button type="button" onClick={onClose} aria-label="Close">×</button></div><label className="oi-trade-target">Trade with <select disabled={Boolean(offer)} value={targetId} onChange={(event) => { setTargetId(event.target.value); setReceive(emptyAssets()) }}>{match.order.filter((id) => id !== playerId && !match.players[id].bankrupt).map((id) => <option value={id} key={id}>{room.players.find((player) => player.id === id)?.name}</option>)}</select></label><div className="oi-trade-grid"><AssetList title="You give" match={match} room={room} playerId={playerId} assets={give} onChange={setGive} /><AssetList title="You receive" match={match} room={room} playerId={targetId} assets={receive} onChange={setReceive} /></div><div className="oi-modal-actions"><Button variant="quiet" onClick={onClose}>Cancel</Button><Button disabled={!valid || pending} isLoading={pending} onClick={() => onSubmit(offer ? { type: 'trade_counter', offerId: offer.id, give, receive } : { type: 'trade_offer', toId: targetId, give, receive })}>{offer ? 'Send counteroffer' : 'Send offer'} ↗</Button></div></div></div>
}

function PropertyCard({ tile, match, room, onClose }: { tile: BoardTile; match: MatchSnapshot; room: RoomSnapshot; onClose: () => void }) {
  const holding = match.properties[tile.index]
  const owner = room.players.find((player) => player.id === holding?.ownerId)
  return <div className="oi-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div className="oi-modal oi-deed" role="dialog" aria-modal="true" aria-label={`${tile.name} details`}><div className={`oi-deed__banner oi-group-${tile.group ?? tile.type.toLowerCase()}`}><span>{tile.group ? (tile.region ?? `${groupLabels[tile.group]} district`) : tile.type.toLowerCase()}</span><button type="button" onClick={onClose} aria-label="Close">×</button><h2>{tile.name}</h2></div><div className="oi-deed__body"><div className="oi-deed__owner"><span>{owner ? `Owned by ${owner.name}` : tile.price ? 'Available to own' : 'Board space'}</span>{holding?.mortgaged && <strong>MORTGAGED</strong>}{holding?.buildings > 0 && <strong>{holding.buildings === 5 ? 'HOTEL' : `${holding.buildings} HOUSES`}</strong>}</div>{tile.price ? <><div className="oi-deed__price"><span>Purchase price</span><strong>{cash(tile.price)}</strong></div>{tile.rents && <div className="oi-rent-table">{tile.type === 'UTILITY' ? tile.rents.map((value, index) => <div key={index}><span>{index + 1} utilities owned</span><strong>Dice × {value}</strong></div>) : tile.type === 'TRANSPORT' ? tile.rents.map((value, index) => <div key={index}><span>{index + 1} stations owned</span><strong>{cash(value)}</strong></div>) : tile.rents.map((value, index) => <div key={index}><span>{index === 0 ? 'Base rent' : index === 5 ? 'Hotel' : `${index} ${index === 1 ? 'house' : 'houses'}`}</span><strong>{cash(value)}</strong></div>)}</div>}<div className="oi-deed__footer"><span>Mortgage {cash(tile.mortgage ?? 0)}</span>{tile.buildCost && <span>Build cost {cash(tile.buildCost)}</span>}</div></> : <p>{tile.type === 'FREE' ? 'A chance to rest—or collect the pot if that house rule is on.' : tile.type === 'JAIL' ? 'Just visiting, unless the rules brought you here.' : tile.type === 'CARD' ? 'Draw a card when you land here.' : tile.type === 'TAX' ? `Pay ${cash(tile.index === 4 ? match.settings.incomeTax : match.settings.luxuryTax)} to the bank.` : 'Keep moving!'}</p>}</div></div></div>
}

export function OwnItMatch({ room, playerId, notify }: { room: RoomSnapshot; playerId: string; notify: (message: string) => void }) {
  const [match, setMatch] = useState<MatchSnapshot | null>(null)
  const [pending, setPending] = useState(false)
  const [now, setNow] = useState(0)
  const [selectedTile, setSelectedTile] = useState<BoardTile | null>(null)
  const [portfolioOpen, setPortfolioOpen] = useState(false)
  const [tradeOpen, setTradeOpen] = useState(false)
  const [counterOffer, setCounterOffer] = useState<TradeOffer | null>(null)
  const [hostMenuOpen, setHostMenuOpen] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [confirmBankrupt, setConfirmBankrupt] = useState(false)
  const [customBid, setCustomBid] = useState('')
  const [tokenPositions, setTokenPositions] = useState<Record<string, number>>({})
  const animatedMoveAt = useRef<number | null>(null)
  const animationTimers = useRef<number[]>([])
  const sendRef = useRef<(action: PropertyAction) => Promise<MatchSnapshot | null>>(async () => null)
  const diceActionRef = useRef<PropertyAction>({ type: 'roll' })
  const onDiceRoll = useCallback(async () => Boolean(await sendRef.current(diceActionRef.current)), [])
  const isHost = room.hostId === playerId

  useEffect(() => {
    const update = (next: MatchSnapshot) => setMatch(next)
    socket.on('property:state', update)
    void getPropertyMatch().then((result) => { if (result.ok && result.data) setMatch(result.data) })
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => { socket.off('property:state', update); window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    const move = match?.lastMove
    if (!move || move.at === animatedMoveAt.current) return
    animatedMoveAt.current = move.at
    animationTimers.current.forEach(window.clearTimeout)
    animationTimers.current = []
    if (!move.steps || Math.abs(move.steps) > 40 || Date.now() - move.at > 5000) return
    animationTimers.current.push(window.setTimeout(() => setTokenPositions((positions) => ({ ...positions, [move.playerId]: move.from })), 0))
    for (let step = 1; step <= Math.abs(move.steps); step += 1) {
      const length = getPropertyBoard(match.settings.mapId).length
      const position = ((move.from + step * Math.sign(move.steps)) % length + length) % length
      animationTimers.current.push(window.setTimeout(() => setTokenPositions((positions) => ({ ...positions, [move.playerId]: position })), step * 120))
    }
  }, [match])

  useEffect(() => () => { animationTimers.current.forEach(window.clearTimeout) }, [])

  const send = async (action: PropertyAction): Promise<MatchSnapshot | null> => {
    if (pending) return null
    setPending(true)
    const result = await propertyAction(action)
    setPending(false)
    if (result.ok) {
      if ('phase' in result.data) setMatch(result.data)
      setTradeOpen(false)
      setCounterOffer(null)
      setConfirmBankrupt(false)
      setConfirmEnd(false)
      return 'phase' in result.data ? result.data : null
    } else notify(result.error.message)
    return null
  }
  useEffect(() => { sendRef.current = send })
  useEffect(() => {
    if (!match) return
    diceActionRef.current = match.players[match.currentPlayerId]?.inJail ? { type: 'jail', choice: 'roll' } : { type: 'roll' }
  }, [match])

  if (!match) return <main className="oi-page oi-loading"><span className="large-loader" /><h1>Setting the board…</h1><p>Getting everyone’s game state in sync.</p></main>

  const board = getPropertyBoard(match.settings.mapId)
  const ownableTiles = getOwnableTiles(match.settings.mapId)

  const self = match.players[playerId]
  const active = match.players[match.currentPlayerId]
  const isMyTurn = match.currentPlayerId === playerId
  const isJailRoll = Boolean(active?.inJail)
  const canRoll = !pending && !match.paused && match.phase === 'PRE_ROLL' && isMyTurn && (!isJailRoll || match.settings.allowDoublesEscape)
  const isDebtor = match.debt?.playerId === playerId
  const countdown = match.deadline === null || now === 0 ? null : Math.max(0, Math.ceil((match.deadline - now) / 1000))
  const auction = match.auction
  const incomingTrade = match.trade?.toId === playerId ? match.trade : null
  const ownTiles = ownableTiles.filter((tile) => match.properties[tile.index].ownerId === playerId)
  const rankings = [...match.order].sort((a, b) => worth(match, b) - worth(match, a) || (a === match.winnerId ? -1 : b === match.winnerId ? 1 : 0))
  const isCurrentDecision = !match.paused && (isMyTurn || isDebtor)
  const importantLog = match.log.at(-1)
  const showBanner = importantLog && now > 0 && now - importantLog.at < 4000 && /completed the|built a hotel|went to Jail|went bankrupt|collected the|paid \$(?:[1-9][0-9]{3,}|[5-9][0-9]{2})/i.test(importantLog.text)
  const bid = (amount: number) => void send({ type: 'auction_bid', amount })

  const actionPanel = <section key={`${match.phase}-${match.pendingTile ?? ''}`} className="oi-action-panel" aria-live="polite">
    <div className="oi-action-panel__heading"><span className="oi-kicker">{match.phase === 'FINISHED' ? 'THE FINAL WORD' : match.paused ? 'GAME PAUSED' : match.phase === 'INTRO' ? 'TAKE YOUR PLACES' : `ROUND ${match.round} · TURN ${match.turnNumber}`}</span>{countdown !== null && match.phase !== 'FINISHED' && <span className={`oi-countdown ${countdown <= 5 ? 'is-urgent' : ''}`}>{countdown}s</span>}</div>
    {match.phase === 'INTRO' ? <><h2>Who rolls first?</h2><p>Highest opening roll leads the way.</p>{countdown !== null && countdown <= 3 && <div key={countdown} className="oi-intro-count" aria-label={countdown ? `Game begins in ${countdown}` : 'Go'}>{countdown || 'GO!'}</div>}<ol className="oi-order">{match.order.map((id) => <li key={id}><span>{match.players[id].name}</span><strong>{match.turnOrderRolls[id]}</strong></li>)}</ol></> : null}
    {match.phase === 'FINISHED' ? <><div className="oi-winner-icon">♛</div><h2>{match.winnerId ? `${match.players[match.winnerId]?.name} owns it!` : 'Game over'}</h2><p>{match.winnerReason}</p><div className="oi-result-list">{rankings.map((id, index) => <div key={id} className={match.winnerId === id ? 'is-winner' : ''} style={{ animationDelay: `${index * 170}ms` }}><span>{index + 1}. {match.players[id].name}</span><strong>{cash(worth(match, id))} worth</strong></div>)}</div><details className="oi-match-stats"><summary>Match highlights</summary><div>{rankings.map((id) => <p key={id}><strong>{match.players[id].name}</strong> · {match.players[id].stats.purchased} bought · {cash(match.players[id].stats.rentCollected)} rent collected · {match.players[id].stats.trades} trades</p>)}</div></details>{isHost ? <div className="oi-action-buttons"><Button disabled={pending} onClick={() => void send({ type: 'play_again' })}>Play again</Button><Button disabled={pending} variant="secondary" onClick={() => void send({ type: 'to_settings' })}>Settings</Button><Button disabled={pending} variant="quiet" onClick={() => void send({ type: 'change_game' })}>Change game</Button></div> : <p>Waiting for the host to choose what’s next…</p>}</> : null}
    {match.paused && match.phase !== 'FINISHED' ? <><h2>A little intermission.</h2><p>The host paused play. Timers are frozen until they resume.</p></> : null}
    {!match.paused && match.phase === 'PRE_ROLL' ? <><h2>{isMyTurn ? 'Your move.' : `${active?.name}'s move.`}</h2><p>{active?.inJail ? `${active.name} is in Jail.` : 'The dice are waiting. Tap them to make your move.'}</p>{isMyTurn ? active.inJail ? <div className="oi-action-buttons">{match.settings.allowDoublesEscape && <span className="oi-waiting">Tap the dice to try for doubles</span>}<Button disabled={pending} variant="secondary" onClick={() => void send({ type: 'jail', choice: 'pay' })}>Pay {cash(match.settings.jailFine)}</Button>{active.jailCards.length > 0 && <Button disabled={pending} variant="quiet" onClick={() => void send({ type: 'jail', choice: 'card' })}>Use jail card</Button>}</div> : <div className="oi-action-buttons"><span className="oi-waiting">Tap the dice above to roll</span>{match.settings.trading && <Button variant="quiet" onClick={() => setTradeOpen(true)}>Trade</Button>}</div> : <span className="oi-waiting">Watching the roll…</span>}</> : null}
    {!match.paused && match.phase === 'PROPERTY_DECISION' && match.pendingTile !== null ? <><span className="oi-kicker">AVAILABLE PROPERTY</span><h2>{board[match.pendingTile].name}</h2><p>Make it yours for <strong>{cash(board[match.pendingTile].price ?? 0)}</strong>, or send it to auction.</p>{isMyTurn ? <div className="oi-action-buttons"><Button disabled={pending || self.cash < (board[match.pendingTile].price ?? 0)} onClick={() => void send({ type: 'buy' })}>Buy property</Button><Button disabled={pending} variant="secondary" onClick={() => void send({ type: 'decline' })}>{match.settings.auctions ? 'Send to auction' : 'Pass'}</Button></div> : <span className="oi-waiting">Waiting for {active?.name} to decide…</span>}</> : null}
    {!match.paused && match.phase === 'AUCTION' && auction ? <><span className="oi-kicker">GOING ONCE, GOING TWICE</span><h2>{board[auction.tile].name}</h2><div className="oi-bid-display"><small>Highest bid</small><strong>{cash(auction.highestBid)}</strong><span>{auction.highestBidderId ? match.players[auction.highestBidderId]?.name : 'No bids yet'}</span></div>{self && !self.bankrupt && !auction.passed.includes(playerId) ? <><div className="oi-bid-options">{[10, 50, 100].map((increment) => <button key={increment} type="button" disabled={pending || auction.highestBid + Math.max(increment, match.settings.auctionIncrement) > self.cash} onClick={() => bid(auction.highestBid + Math.max(increment, match.settings.auctionIncrement))}>+{increment}</button>)}</div><div className="oi-custom-bid"><input aria-label="Custom auction bid" type="number" min={auction.highestBid + match.settings.auctionIncrement} max={self.cash} placeholder="Custom bid" value={customBid} onChange={(event) => setCustomBid(event.target.value)} /><Button disabled={pending || Number(customBid) < auction.highestBid + match.settings.auctionIncrement || Number(customBid) > self.cash} onClick={() => bid(Number(customBid))}>Bid</Button><Button disabled={pending} variant="quiet" onClick={() => void send({ type: 'auction_pass' })}>Pass</Button></div></> : <span className="oi-waiting">Watching the auction…</span>}</> : null}
    {!match.paused && match.phase === 'TRADE_PENDING' && match.trade ? <><span className="oi-kicker">A DEAL IS ON THE TABLE</span><h2>{incomingTrade ? `${match.players[match.trade.fromId].name} has an offer.` : 'Offer sent.'}</h2>{incomingTrade ? <><div className="oi-trade-summary"><div><small>You receive</small><strong>{cash(incomingTrade.give.cash)}</strong>{incomingTrade.give.properties.map((index) => <span key={index}>{board[index].name}</span>)}{incomingTrade.give.jailCards.length > 0 && <span>{incomingTrade.give.jailCards.length} jail card</span>}</div><div><small>You give</small><strong>{cash(incomingTrade.receive.cash)}</strong>{incomingTrade.receive.properties.map((index) => <span key={index}>{board[index].name}</span>)}{incomingTrade.receive.jailCards.length > 0 && <span>{incomingTrade.receive.jailCards.length} jail card</span>}</div></div><div className="oi-action-buttons"><Button disabled={pending} onClick={() => void send({ type: 'trade_accept', offerId: incomingTrade.id })}>Accept deal</Button><Button disabled={pending} variant="secondary" onClick={() => { setCounterOffer(incomingTrade); setTradeOpen(true) }}>Counter</Button><Button disabled={pending} variant="quiet" onClick={() => void send({ type: 'trade_decline', offerId: incomingTrade.id })}>Decline</Button></div></> : match.trade.fromId === playerId ? <div><p>Waiting for {match.players[match.trade.toId]?.name} to respond.</p><Button variant="quiet" disabled={pending} onClick={() => void send({ type: 'trade_cancel', offerId: match.trade!.id })}>Cancel offer</Button></div> : <p>Waiting for this trade to resolve…</p>}</> : null}
    {!match.paused && match.phase === 'DEBT' && match.debt ? <><span className="oi-kicker">SETTLE YOUR BALANCE</span><h2>{isDebtor ? 'Time to make a move.' : `${match.players[match.debt.playerId]?.name} owes money.`}</h2><div className="oi-debt-number">{cash(match.debt.amount)} <small>owed {match.debt.creditorId ? `to ${match.players[match.debt.creditorId]?.name}` : 'to the bank'}</small></div><p>{isDebtor ? `You have ${cash(self.cash)}. Sell buildings, mortgage property or trade to raise the difference.` : 'Waiting for them to settle the balance.'}</p>{isDebtor && <div className="oi-action-buttons"><Button disabled={pending || self.cash < match.debt.amount} onClick={() => void send({ type: 'pay_debt' })}>Pay debt</Button><Button variant="secondary" onClick={() => setPortfolioOpen(true)}>Manage property</Button>{match.settings.trading && <Button variant="quiet" onClick={() => setTradeOpen(true)}>Trade</Button>}<button className="oi-danger-link" type="button" onClick={() => setConfirmBankrupt(true)}>Declare bankruptcy</button></div>}</> : null}
    {!match.paused && match.phase === 'MANAGEMENT' ? <><h2>{isMyTurn ? 'The board is yours.' : `${active?.name} is deciding.`}</h2><p>{isMyTurn ? 'Build, mortgage or make a deal—then pass the dice.' : 'Watch the next move unfold.'}</p>{isMyTurn && <div className="oi-action-buttons"><Button disabled={pending} onClick={() => void send({ type: 'end_turn' })}>{match.doublesCount > 0 && !active.inJail ? 'Roll again ↗' : 'End turn ↗'}</Button><Button variant="secondary" onClick={() => setPortfolioOpen(true)}>Properties</Button>{match.settings.trading && <Button variant="quiet" onClick={() => setTradeOpen(true)}>Trade</Button>}</div>}</> : null}
  </section>

  return <main className="oi-page oi-match page-enter"><div className="oi-topline"><span className="oi-logo">✦ OWN IT! <small>BY PARTY POPPER</small></span><div className="oi-topline__right"><span className="oi-room">ROOM {room.code}</span><button type="button" className="oi-menu-button" onClick={() => setPortfolioOpen(true)}>My properties</button>{isHost && match.phase !== 'FINISHED' && <button type="button" className="oi-menu-button" onClick={() => setHostMenuOpen(true)}>Game menu ⚙</button>}</div></div>{showBanner && <div className="oi-event-banner" role="status">✦ {importantLog.text}</div>}<header className="oi-match-header"><div><span className="oi-kicker">{PROPERTY_MAPS[match.settings.mapId].name.toUpperCase()} / THE BOARD IS LIVE</span><h1>{match.phase === 'FINISHED' ? 'The final deed.' : `${active?.name}'s turn`}</h1></div><div className="oi-match-header__meta"><span>ROUND <strong>{match.round}</strong></span>{match.dice && <span>DICE <strong>{match.dice.join(' + ')}</strong></span>}{match.endsAt && <span>TIME <strong>{now ? Math.max(0, Math.ceil((match.endsAt - now) / 60000)) : '…'}m</strong></span>}</div></header><div className="oi-game-layout"><section className="oi-board-wrap"><div className="oi-board-scroll"><OwnItBoard match={match} room={room} tokenPositions={tokenPositions} onTileClick={setSelectedTile} /></div><p className="oi-board-hint">Tap any space to see its details. On a small screen, drag the board to explore.</p></section><div className="oi-side-column"><TabletopDice dice={match.dice} rollAt={match.lastRollAt} canRoll={canRoll} isJailRoll={isJailRoll} onRoll={onDiceRoll} />{actionPanel}<section className="oi-players-panel"><div className="oi-panel-title"><span className="oi-kicker">THE COMPETITION</span><h2>Players</h2></div>{match.order.map((id, rank) => { const player = match.players[id]; const identity = room.players.find((entry) => entry.id === id); if (!identity) return null; return <div key={id} className={`oi-player-row ${id === match.currentPlayerId ? 'is-active' : ''} ${player.bankrupt ? 'is-bankrupt' : ''}`} style={{ '--player-color': getColourHex(player.colour) } as CSSProperties}><span className="oi-player-row__rank">{String(rank + 1).padStart(2, '0')}</span><span className="oi-avatar"><AvatarArt avatar={player.avatar} /></span><span className="oi-player-row__name"><strong>{identity.name}</strong><small>{player.bankrupt ? 'BANKRUPT' : player.inJail ? 'IN JAIL' : id === match.currentPlayerId ? 'CURRENT TURN' : !identity.isConnected ? 'DISCONNECTED · AUTO-PLAY' : `${ownableTiles.filter((tile) => match.properties[tile.index].ownerId === id).length} properties`}</small></span><strong className="oi-player-row__cash">{cash(player.cash)}</strong></div> })}<div className="oi-bank-line"><span>Free Parking pot</span><strong>{cash(match.pot)}</strong></div></section><details className="oi-log"><summary>Game log <span>↗</span></summary><ol>{[...match.log].reverse().map((entry) => <li key={entry.id}>{entry.text}</li>)}</ol></details></div></div>
    {selectedTile && <PropertyCard tile={selectedTile} match={match} room={room} onClose={() => setSelectedTile(null)} />}
    {portfolioOpen && <div className="oi-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPortfolioOpen(false) }}><div className="oi-modal oi-portfolio" role="dialog" aria-modal="true" aria-label="My properties"><div className="oi-modal-head"><div><span className="oi-kicker">YOUR PORTFOLIO</span><h2>Manage your empire.</h2></div><button type="button" onClick={() => setPortfolioOpen(false)} aria-label="Close">×</button></div><p>{ownTiles.length} properties · {cash(self?.cash ?? 0)} cash</p>{ownTiles.length ? <div className="oi-property-list">{ownTiles.map((tile) => { const holding = match.properties[tile.index]; const canSpend = !match.paused && !isDebtor && (match.settings.buildingTiming === 'any_time' ? ['PRE_ROLL', 'PROPERTY_DECISION', 'MANAGEMENT'].includes(match.phase) : isMyTurn && (match.phase === 'MANAGEMENT' || (match.settings.buildingTiming === 'own_turn' && match.phase === 'PRE_ROLL'))); const mayManage = isCurrentDecision && ['PRE_ROLL', 'MANAGEMENT', 'DEBT'].includes(match.phase); return <article key={tile.index}><span className={`oi-group-dot oi-group-${tile.group ?? tile.type.toLowerCase()}`} /><div><strong>{tile.name}</strong><small>{holding.mortgaged ? 'MORTGAGED' : holding.buildings === 5 ? 'HOTEL' : holding.buildings ? `${holding.buildings} houses` : tile.group ? (tile.region ?? `${groupLabels[tile.group]} district`) : tile.type.toLowerCase()}</small></div><div className="oi-property-actions">{tile.type === 'PROPERTY' && <><button type="button" disabled={pending || !canSpend || holding.buildings === 5} onClick={() => void send({ type: 'build', tile: tile.index })}>+ Build</button><button type="button" disabled={pending || !(canSpend || isDebtor) || holding.buildings === 0} onClick={() => void send({ type: 'sell_building', tile: tile.index })}>− Sell</button></>}<button type="button" disabled={pending || !mayManage || (holding.mortgaged && isDebtor)} onClick={() => void send({ type: holding.mortgaged ? 'unmortgage' : 'mortgage', tile: tile.index })}>{holding.mortgaged ? 'Unmortgage' : 'Mortgage'}</button><button type="button" onClick={() => { setPortfolioOpen(false); setSelectedTile(tile) }}>View</button></div></article> })}</div> : <div className="oi-empty-state">No deeds yet. Land on an unowned property and make it yours.</div>}<p className="oi-helper">Complete an unmortgaged colour set to build. Even building and bank supply rules are checked automatically.</p></div></div>}
    {tradeOpen && <TradeEditor match={match} room={room} playerId={playerId} offer={counterOffer} onClose={() => { setTradeOpen(false); setCounterOffer(null) }} onSubmit={(action) => void send(action)} pending={pending} />}
    {hostMenuOpen && <div className="oi-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHostMenuOpen(false) }}><div className="oi-modal oi-host-modal" role="dialog" aria-modal="true" aria-label="Host game controls"><div className="oi-modal-head"><div><span className="oi-kicker">HOST CONTROLS</span><h2>Game menu</h2></div><button type="button" onClick={() => setHostMenuOpen(false)} aria-label="Close">×</button></div><p>Host controls pause the whole room. They cannot alter dice, cash or deeds.</p><div className="oi-host-actions"><Button disabled={pending} onClick={() => { void send({ type: match.paused ? 'resume' : 'pause' }); setHostMenuOpen(false) }}>{match.paused ? 'Resume game' : 'Pause game'}</Button><button type="button" onClick={() => setConfirmEnd(true)}>End game early</button></div><details><summary>Current settings</summary><pre>{JSON.stringify(match.settings, null, 2)}</pre></details></div></div>}
    {confirmEnd && <div className="oi-overlay"><div className="oi-modal oi-confirm" role="dialog" aria-modal="true" aria-label="End game early"><span className="oi-kicker">ARE YOU SURE?</span><h2>End this game?</h2><p>Everyone will return to Own It! settings. This match cannot be resumed.</p><div className="oi-modal-actions"><Button variant="quiet" onClick={() => setConfirmEnd(false)}>Cancel</Button><Button variant="danger" disabled={pending} onClick={() => { void send({ type: 'end_game' }); setHostMenuOpen(false) }}>End game</Button></div></div></div>}
    {confirmBankrupt && <div className="oi-overlay"><div className="oi-modal oi-confirm" role="dialog" aria-modal="true" aria-label="Declare bankruptcy"><span className="oi-kicker">FINAL DECISION</span><h2>Declare bankruptcy?</h2><p>Your assets transfer to the creditor, or return to the bank for auction. You can stay and watch the match.</p><div className="oi-modal-actions"><Button variant="quiet" onClick={() => setConfirmBankrupt(false)}>Keep trying</Button><Button variant="danger" disabled={pending} onClick={() => void send({ type: 'bankrupt' })}>Declare bankruptcy</Button></div></div></div>}
  </main>
}
