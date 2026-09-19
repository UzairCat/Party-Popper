import { memo, useEffect, useRef, useState } from 'react'

type DicePair = [number, number]

const PIPS: Record<number, number[]> = {
  1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9],
}

function rollSound() {
  const AudioContextClass = window.AudioContext
  if (!AudioContextClass) return
  try {
    const context = new AudioContextClass()
    const start = context.currentTime
    for (let index = 0; index < 7; index += 1) {
      const at = start + index * 0.085
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'triangle'
      oscillator.frequency.setValueAtTime(180 + (index % 3) * 55, at)
      oscillator.frequency.exponentialRampToValueAtTime(68, at + 0.055)
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.055 - index * 0.004, at + 0.006)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.065)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(at)
      oscillator.stop(at + 0.07)
    }
    window.setTimeout(() => void context.close(), 1300)
  } catch { /* Audio is optional; the roll remains usable without it. */ }
}

function Die({ value, index }: { value: number; index: number }) {
  return <span className={`oi-physical-die oi-physical-die--${index + 1}`} data-face={value} aria-hidden="true"><span className="oi-physical-die__face">{Array.from({ length: 9 }, (_, position) => <i key={position} className={PIPS[value].includes(position + 1) ? 'is-visible' : ''} />)}</span></span>
}

interface Props {
  dice: DicePair | null
  rollAt: number | null
  canRoll: boolean
  isJailRoll: boolean
  onRoll: () => Promise<boolean>
}

export const TabletopDice = memo(function TabletopDice({ dice, rollAt, canRoll, isJailRoll, onRoll }: Props) {
  const [shown, setShown] = useState<DicePair>(dice ?? [3, 5])
  const [rolling, setRolling] = useState(false)
  const [locked, setLocked] = useState(false)
  const [settled, setSettled] = useState(false)
  const [soundOn, setSoundOn] = useState(() => window.localStorage.getItem('own-it-dice-sound') !== 'off')
  const busy = useRef(false)
  const seenRollAt = useRef<number | null>(rollAt)
  const startedAt = useRef<number | null>(null)
  const timers = useRef<number[]>([])
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

  useEffect(() => {
    if (rollAt === null || !dice || rollAt === seenRollAt.current) return
    seenRollAt.current = rollAt
    const reduce = reducedMotion()
    const elapsed = startedAt.current === null ? 0 : performance.now() - startedAt.current
    if (!busy.current) {
      busy.current = true
      setLocked(true)
      setRolling(!reduce)
      startedAt.current = performance.now()
    }
    const wait = reduce ? 70 : Math.max(120, 950 - elapsed)
    timers.current.push(window.setTimeout(() => {
      setShown(dice)
      setRolling(false)
      setSettled(true)
      timers.current.push(window.setTimeout(() => { setSettled(false); setLocked(false); busy.current = false; startedAt.current = null }, reduce ? 120 : 440))
    }, wait))
  }, [dice, rollAt])

  useEffect(() => {
    if (rollAt === null && dice === null && !busy.current) setShown([3, 5])
  }, [dice, rollAt])

  useEffect(() => () => { timers.current.forEach(window.clearTimeout) }, [])

  const roll = async () => {
    if (!canRoll || busy.current) return
    busy.current = true
    setLocked(true)
    startedAt.current = performance.now()
    setSettled(false)
    setRolling(!reducedMotion())
    if (soundOn) rollSound()
    const ok = await onRoll()
    if (!ok) {
      setRolling(false)
      setLocked(false)
      busy.current = false
      startedAt.current = null
    }
  }

  const toggleSound = () => {
    const next = !soundOn
    setSoundOn(next)
    window.localStorage.setItem('own-it-dice-sound', next ? 'on' : 'off')
  }

  return <div className={`oi-dice-tray ${canRoll && !locked ? 'can-roll' : ''} ${rolling ? 'is-rolling' : ''} ${settled ? 'is-settled' : ''}`}>
    <div className="oi-dice-tray__top"><span className="oi-kicker">THE DICE ARE YOURS</span><button type="button" className="oi-dice-sound" onClick={toggleSound} aria-label={soundOn ? 'Mute dice sound' : 'Enable dice sound'} title={soundOn ? 'Mute dice sound' : 'Enable dice sound'}>{soundOn ? '♪ On' : '♪ Off'}</button></div>
    <button type="button" className="oi-dice-roll-target" disabled={!canRoll || locked} onClick={() => void roll()} aria-label={isJailRoll ? 'Roll two dice to try for doubles' : 'Roll two dice'} aria-describedby="oi-dice-hint">
      <Die value={shown[0]} index={0} /><Die value={shown[1]} index={1} />
    </button>
    <div className="oi-dice-tray__foot" id="oi-dice-hint"><span>{rolling ? 'Rolling…' : canRoll ? isJailRoll ? 'Tap the dice to try for doubles' : 'Tap the dice to roll' : dice ? `Last roll · ${dice[0]} + ${dice[1]}` : 'Waiting for the next turn'}</span>{dice && !rolling && <strong aria-live="polite">{dice[0] + dice[1]} {dice[0] === dice[1] ? '· DOUBLES!' : ''}</strong>}</div>
  </div>
})
