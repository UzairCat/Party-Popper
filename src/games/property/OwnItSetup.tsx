import { useEffect, useState, type CSSProperties } from 'react'
import { CLASSIC_SETTINGS, PRESETS, PROPERTY_MAPS, getPropertyBoard, type PropertyAvatar, type PropertyColour, type PropertySettings, type PropertySetupSnapshot } from '../../../shared/property-game'
import type { RoomSnapshot } from '../../../shared/protocol'
import { AvatarArt } from '../../components/player/AvatarArt'
import { IdentityPicker } from '../../components/player/IdentityPicker'
import { Button } from '../../components/common/Button'
import { getColourHex } from '../../data/playerOptions'
import { getPropertySetup, returnToGameSelection, socket, startPropertyMatch, updatePropertyProfile, updatePropertySettings } from '../../lib/socket'
import './own-it.css'

type SettingKey = keyof PropertySettings
interface Field { key: SettingKey; label: string; hint?: string; min?: number; max?: number; step?: number; options?: { label: string; value: string | number }[] }
const MAIN_FIELDS: Field[] = [
  { key: 'startingCash', label: 'Starting cash', hint: 'Money each player begins with.', min: 500, max: 5000, step: 100 },
  { key: 'passStartReward', label: 'Pass Start reward', min: 0, max: 1000, step: 50 },
  { key: 'endCondition', label: 'Game ends', options: [{ label: 'Last player standing', value: 'last' }, { label: 'Round limit', value: 'rounds' }, { label: 'Time limit', value: 'time' }] },
  { key: 'turnTimer', label: 'Turn timer', options: [0, 30, 45, 60, 90, 120].map((value) => ({ label: value ? `${value} seconds` : 'Off', value })) },
  { key: 'auctions', label: 'Property auctions', hint: 'Passed-up properties go to the highest bidder.' },
  { key: 'freeParkingBonus', label: 'Free Parking pot', hint: 'Bank fines and taxes collect in a pot.' },
  { key: 'trading', label: 'Trading', hint: 'Trade cash, property and jail cards.' },
  { key: 'buildingRule', label: 'Building rules', options: [{ label: 'Classic / even', value: 'even' }, { label: 'Free build', value: 'free' }] },
]
const ADVANCED: { heading: string; fields: Field[] }[] = [
  { heading: 'Economy', fields: [
    { key: 'exactStartBonus', label: 'Double reward for exact Start landing' },
    { key: 'incomeTax', label: 'City tax', min: 0, max: 1000, step: 10 },
    { key: 'luxuryTax', label: 'Luxury tax', min: 0, max: 1000, step: 10 },
    { key: 'freeParkingStartingPot', label: 'Starting pot', min: 0, max: 2000, step: 50 },
    { key: 'mortgageInterest', label: 'Unmortgage interest %', min: 0, max: 50, step: 1 },
  ] },
  { heading: 'Auctions & trading', fields: [
    { key: 'auctionTimer', label: 'Auction opening timer', min: 5, max: 60, step: 1 },
    { key: 'auctionIncrement', label: 'Minimum bid increment', min: 1, max: 500, step: 1 },
    { key: 'tradeDevelopedGroups', label: 'Trade developed colour groups' },
  ] },
  { heading: 'Buildings', fields: [
    { key: 'buildingTiming', label: 'When to build', options: [{ label: 'During own turn', value: 'own_turn' }, { label: 'At end of own turn', value: 'end_turn' }, { label: 'Any time', value: 'any_time' }] },
    { key: 'limitedBuildings', label: 'Limited bank supply' },
    { key: 'houseSupply', label: 'Bank houses', min: 1, max: 100, step: 1 },
    { key: 'hotelSupply', label: 'Bank hotels', min: 1, max: 50, step: 1 },
    { key: 'buildingSellPercent', label: 'Building sell value %', min: 25, max: 100, step: 5 },
  ] },
  { heading: 'Jail & turns', fields: [
    { key: 'maxJailTurns', label: 'Maximum jail attempts', min: 1, max: 5, step: 1 },
    { key: 'jailFine', label: 'Jail fine', min: 0, max: 500, step: 10 },
    { key: 'collectRentInJail', label: 'Collect rent while jailed' },
    { key: 'allowDoublesEscape', label: 'Escape on doubles' },
    { key: 'doublesExtraTurn', label: 'Doubles earn another roll' },
    { key: 'threeDoublesJail', label: 'Three doubles send to Jail' },
    { key: 'autoEndTurn', label: 'Auto-end turns' },
  ] },
]

function SettingRow({ field, settings, disabled, onChange }: { field: Field; settings: PropertySettings; disabled: boolean; onChange: (key: SettingKey, value: string | number | boolean) => void }) {
  const value = settings[field.key]
  return <div className="oi-setting">
    <div><strong>{field.label}</strong>{field.hint && <small>{field.hint}</small>}</div>
    {typeof value === 'boolean' ? <button className={`oi-switch ${value ? 'is-on' : ''}`} type="button" role="switch" aria-checked={value} aria-label={field.label} disabled={disabled} onClick={() => onChange(field.key, !value)}><span />{value ? 'On' : 'Off'}</button>
      : field.options ? <select aria-label={field.label} value={String(value)} disabled={disabled} onChange={(event) => onChange(field.key, typeof value === 'number' ? Number(event.target.value) : event.target.value)}>{field.options.map((option) => <option key={String(option.value)} value={option.value}>{option.label}</option>)}</select>
        : <div className="oi-stepper"><button type="button" aria-label={`Decrease ${field.label}`} disabled={disabled || Number(value) <= (field.min ?? 0)} onClick={() => onChange(field.key, Math.max(field.min ?? 0, Number(value) - (field.step ?? 1)))}>−</button><output>{Number(value).toLocaleString()}</output><button type="button" aria-label={`Increase ${field.label}`} disabled={disabled || Number(value) >= (field.max ?? 100)} onClick={() => onChange(field.key, Math.min(field.max ?? 100, Number(value) + (field.step ?? 1)))}>+</button></div>}
  </div>
}

export function OwnItSetup({ room, playerId, onRoom, onLeave, notify }: { room: RoomSnapshot; playerId: string; onRoom: (room: RoomSnapshot) => void; onLeave: () => void; notify: (message: string) => void }) {
  const [settings, setSettings] = useState<PropertySettings>(CLASSIC_SETTINGS)
  const [setup, setSetup] = useState<PropertySetupSnapshot | null>(null)
  const [tab, setTab] = useState<'settings' | 'advanced' | 'rules'>('settings')
  const [pending, setPending] = useState(false)
  const isHost = room.hostId === playerId
  const connected = room.players.filter((player) => player.isConnected)
  const profile = setup?.profiles[playerId]
  const readyCount = connected.filter((player) => setup?.profiles[player.id]?.ready).length
  const canStart = connected.length >= 2 && connected.length <= 8 && connected.length === room.players.length && readyCount === connected.length

  useEffect(() => {
    const onSettings = (value: PropertySettings) => setSettings(value)
    const onSetup = (value: PropertySetupSnapshot) => { setSetup(value); setSettings(value.settings) }
    socket.on('property:settings', onSettings)
    socket.on('property:setup', onSetup)
    void getPropertySetup().then((result) => { if (result.ok) onSetup(result.data) })
    return () => { socket.off('property:settings', onSettings); socket.off('property:setup', onSetup) }
  }, [])

  const choose = async (value: { avatar?: PropertyAvatar; colour?: PropertyColour; ready?: boolean }) => {
    if (pending) return
    setPending(true)
    const result = await updatePropertyProfile(value)
    setPending(false)
    if (result.ok) setSetup(result.data)
    else notify(result.error.message)
  }

  const change = async (key: SettingKey, value: string | number | boolean) => {
    if (!isHost || pending) return
    const next = { ...settings, [key]: value, preset: 'custom' as const }
    setPending(true)
    const result = await updatePropertySettings(next)
    setPending(false)
    if (result.ok) setSettings(result.data)
    else notify(result.error.message)
  }

  const preset = async (name: 'classic' | 'quick' | 'casual') => {
    if (!isHost || pending) return
    setPending(true)
    const result = await updatePropertySettings({ ...PRESETS[name], mapId: settings.mapId })
    setPending(false)
    if (result.ok) setSettings(result.data)
    else notify(result.error.message)
  }

  const start = async () => {
    if (!canStart || pending) return
    setPending(true)
    const result = await startPropertyMatch()
    setPending(false)
    if (!result.ok) notify(result.error.message)
  }

  const back = async () => {
    if (pending) return
    setPending(true)
    const result = await returnToGameSelection()
    setPending(false)
    if (result.ok) onRoom(result.data)
    else notify(result.error.message)
  }

  return <main className="oi-page oi-setup page-enter">
    <div className="oi-topline"><span className="oi-logo">✦ PARTY POPPER / GAME 01</span><span className="oi-room">ROOM {room.code}</span></div>
    <section className="oi-hero">
      <div className="oi-hero__copy"><span className="oi-kicker">THE PROPERTY TRADING GAME</span><h1>OWN <em>IT!</em></h1><p>Roll for opportunity. Build your empire. Make the deal that changes everything.</p><div className="oi-hero__pills"><span>🎲 2–8 players</span><span>◇ 40 spaces</span><span>♛ One winner</span></div></div>
      <div className="oi-hero__art" aria-hidden="true"><div className="oi-art-card oi-art-card--back">$</div><div className="oi-art-card oi-art-card--front"><span>YOUR NEXT MOVE</span><strong>MAKE<br />IT<br />COUNT.</strong><i>✦</i></div><div className="oi-art-die">⚄</div></div>
    </section>
    <section className="oi-setup-layout">
      <div className="oi-setup-main">
        <section className={`oi-character-card ${profile?.ready ? 'is-ready' : ''}`}>
          <div className="oi-character-card__head"><div><span className="oi-kicker">YOUR SEAT AT THE TABLE</span><h2>Choose your look.</h2><p>Your character and colour belong to Own It! only.</p></div><span className="oi-character-preview" style={{ '--player-color': profile?.colour ? getColourHex(profile.colour) : '#d8e1d4' } as CSSProperties}>{profile?.avatar ? <AvatarArt avatar={profile.avatar} /> : '?'}</span></div>
          <IdentityPicker avatar={profile?.avatar ?? null} colour={profile?.colour ?? null} disabled={pending || Boolean(profile?.ready)} onAvatarChange={(avatar) => void choose({ avatar })} onColourChange={(colour) => void choose({ colour })} />
          <div className="oi-character-card__foot"><span>{profile?.ready ? 'Locked in! Unready to change your look.' : !profile?.avatar || !profile?.colour ? 'Pick both a character and a colour to get ready.' : 'Your look is set. Ready up when you are.'}</span><Button disabled={pending || (!profile?.ready && (!profile?.avatar || !profile?.colour))} onClick={() => void choose({ ready: !profile?.ready })}>{profile?.ready ? '✓ Ready · change' : 'Ready up ↗'}</Button></div>
        </section>
        <div className="oi-config">
          <div className="oi-tabs" role="tablist" aria-label="Game setup sections"><button type="button" className={tab === 'settings' ? 'is-active' : ''} onClick={() => setTab('settings')}>Game settings</button><button type="button" className={tab === 'advanced' ? 'is-active' : ''} onClick={() => setTab('advanced')}>Advanced</button><button type="button" className={tab === 'rules' ? 'is-active' : ''} onClick={() => setTab('rules')}>How to play</button></div>
          {tab === 'settings' && <div className="oi-config__body">
            <div className="oi-section-title"><div><span className="oi-kicker">01 / THE WORLD</span><h2>Choose a map</h2></div><span className="oi-tag">{PROPERTY_MAPS[settings.mapId].name}</span></div>
            <div className="oi-map-options">{Object.values(PROPERTY_MAPS).map((map) => <button key={map.id} type="button" className={`oi-map-option oi-map-option--${map.id} ${settings.mapId === map.id ? 'is-active' : ''}`} aria-pressed={settings.mapId === map.id} disabled={!isHost || pending} onClick={() => void change('mapId', map.id)}><span className="oi-map-option__art" aria-hidden="true">{map.id === 'classic' ? '◇' : 'ZA'}</span><strong>{map.name}</strong><small>{map.subtitle}</small><span className="oi-map-option__check">{settings.mapId === map.id ? '✓ Selected' : 'Select map'}</span></button>)}</div>
            <div className="oi-section-title"><div><span className="oi-kicker">02 / MAKE IT YOURS</span><h2>Rule presets</h2></div><span className="oi-tag">{settings.preset}</span></div>
            <div className="oi-presets">{(['classic', 'quick', 'casual'] as const).map((name) => <button key={name} type="button" className={settings.preset === name ? 'is-active' : ''} disabled={!isHost || pending} onClick={() => void preset(name)}><strong>{name}</strong><small>{name === 'classic' ? 'The full experience' : name === 'quick' ? '60-minute race' : 'More money, more chaos'}</small></button>)}</div>
            <div className="oi-section-title"><div><span className="oi-kicker">03 / HOUSE RULES</span><h2>Match settings</h2></div></div>
            {MAIN_FIELDS.map((field) => <SettingRow key={field.key} field={field} settings={settings} disabled={!isHost || pending} onChange={(key, value) => void change(key, value)} />)}
            {settings.endCondition === 'rounds' && <SettingRow field={{ key: 'maxRounds', label: 'Maximum rounds', min: 10, max: 100, step: 1 }} settings={settings} disabled={!isHost || pending} onChange={(key, value) => void change(key, value)} />}
            {settings.endCondition === 'time' && <SettingRow field={{ key: 'timeLimitMinutes', label: 'Time limit (minutes)', min: 15, max: 240, step: 1 }} settings={settings} disabled={!isHost || pending} onChange={(key, value) => void change(key, value)} />}
          </div>}
          {tab === 'advanced' && <div className="oi-config__body">{ADVANCED.map((section) => <section key={section.heading}><div className="oi-section-title"><h2>{section.heading}</h2></div>{section.fields.map((field) => <SettingRow key={field.key} field={field} settings={settings} disabled={!isHost || pending} onChange={(key, value) => void change(key, value)} />)}</section>)}</div>}
          {tab === 'rules' && <div className="oi-rules"><span className="oi-kicker">THE SHORT VERSION</span><h2>Get rich. Stay rich.</h2><div className="oi-rule-grid"><article><span>01</span><h3>Roll & roam</h3><p>Take turns rolling two dice and moving clockwise. Pass Start to collect cash.</p></article><article><span>02</span><h3>Claim the block</h3><p>Buy unowned properties. Complete a colour group to build houses and hotels.</p></article><article><span>03</span><h3>Collect the rent</h3><p>Land on someone else’s property and pay them. Trade or mortgage when cash runs low.</p></article><article><span>04</span><h3>Own the endgame</h3><p>Bankrupt your rivals—or lead in net worth when a round or time limit ends.</p></article></div><p className="oi-rules__note">The {PROPERTY_MAPS[settings.mapId].name} board has {getPropertyBoard(settings.mapId).length} spaces. Every roll, purchase and payment is verified by the server.</p></div>}
        </div>
      </div>
      <aside className="oi-setup-side">
        <div className="oi-party-card"><span className="oi-kicker">THE PLAYERS</span><h2>Your table <span>{readyCount}/{connected.length} ready</span></h2>{room.players.map((player) => { const look = setup?.profiles[player.id]; return <div key={player.id} className={`oi-party-player ${!player.isConnected ? 'is-away' : ''} ${look?.ready ? 'is-ready' : ''}`}><span className="oi-avatar" style={{ '--player-color': look?.colour ? getColourHex(look.colour) : '#dce7d9' } as CSSProperties}>{look?.avatar ? <AvatarArt avatar={look.avatar} /> : player.name.slice(0, 1).toUpperCase()}</span><strong>{player.name}</strong>{player.id === room.hostId && <small>HOST</small>}<small className="oi-party-player__status">{!player.isConnected ? 'AWAY' : look?.ready ? 'READY ✓' : 'CHOOSING'}</small></div> })}{connected.length < 2 && <p className="oi-helper">Invite one more player to start.</p>}{room.players.length > 8 && <p className="oi-helper">Own It! supports up to eight players.</p>}{room.players.length !== connected.length && <p className="oi-helper">Wait for everyone to reconnect before starting.</p>}</div>
        <div className="oi-start-card"><span className="oi-kicker">READY WHEN YOU ARE</span><h2>Fortune favours<br />the bold.</h2><p>{readyCount} of {connected.length} players ready · {PROPERTY_MAPS[settings.mapId].name} map</p>{isHost ? <Button size="large" disabled={!canStart || pending} isLoading={pending} onClick={() => void start()}>Start game <span aria-hidden="true">↗</span></Button> : <p>Waiting for the host to start the game…</p>}<button type="button" onClick={() => void back()} disabled={!isHost || pending}>← Back to games</button><button type="button" onClick={onLeave}>Leave room</button></div>
      </aside>
    </section>
  </main>
}
