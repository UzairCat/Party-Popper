// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CARDS, CLASSIC_SETTINGS, type MatchSnapshot, type PropertyAction } from '../shared/property-game'
import type { RoomSnapshot } from '../shared/protocol'
import { PropertyGameManager } from '../server/games/property-game-manager'
import { OwnItSetup } from '../src/games/property/OwnItSetup'
import { OwnItMatch } from '../src/games/property/OwnItMatch'
import { TabletopDice } from '../src/games/property/TabletopDice'

const context = vi.hoisted(() => ({ match: null as MatchSnapshot | null, action: null as ((action: PropertyAction) => MatchSnapshot) | null }))
vi.mock('../src/lib/socket', () => ({
  socket: { on: vi.fn(), off: vi.fn() },
  getPropertySetup: async () => ({ ok: true, data: { settings: CLASSIC_SETTINGS, profiles: { host: { avatar: null, colour: null, ready: false }, guest: { avatar: null, colour: null, ready: false } } } }),
  updatePropertyProfile: async () => ({ ok: false, error: { message: 'Not available in this test.' } }),
  updatePropertySettings: async () => ({ ok: true, data: CLASSIC_SETTINGS }),
  getPropertyMatch: async () => ({ ok: true, data: context.match }),
  propertyAction: async (action: PropertyAction) => context.action ? ({ ok: true, data: context.action(action) }) : ({ ok: false, error: { message: 'Not available in this test.' } }),
  returnToGameSelection: async () => ({ ok: false, error: { message: 'Not available in this test.' } }),
  startPropertyMatch: async () => ({ ok: false, error: { message: 'Not available in this test.' } }),
}))

const room: RoomSnapshot = {
  code: 'ABCD', status: 'GAME_SETUP', selectedGameId: 'property_game', hostId: 'host',
  players: [
    { id: 'host', name: 'Host', isConnected: true },
    { id: 'guest', name: 'Guest', isConnected: true },
  ],
  settings: { maxPlayers: 8, allowLateJoin: false, filterNames: true },
  createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
}

afterEach(cleanup)

function ready(manager: PropertyGameManager) {
  manager.setProfile(room, 'host', { avatar: 'robot', colour: 'purple' })
  manager.setProfile(room, 'host', { ready: true })
  manager.setProfile(room, 'guest', { avatar: 'frog', colour: 'green' })
  manager.setProfile(room, 'guest', { ready: true })
}

describe('Own It! screens', () => {
  it('shows the game menu and disables host settings for guests', () => {
    render(<OwnItSetup room={room} playerId="guest" onRoom={() => undefined} onLeave={() => undefined} notify={() => undefined} />)
    expect(screen.getByRole('heading', { name: 'OWN IT!' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Increase Starting cash' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Waiting for the host to start the game…')).toBeTruthy()
  })

  it('renders every board space, players and property portfolio from a restored match', async () => {
    const manager = new PropertyGameManager({ die: () => 1 })
    ready(manager)
    context.match = manager.start(room, 'host')
    render(<OwnItMatch room={{ ...room, status: 'PLAYING' }} playerId="host" notify={() => undefined} />)
    await waitFor(() => expect(screen.getByRole('grid', { name: 'Classic Own It! game board' })).toBeTruthy())
    expect(document.querySelectorAll('.oi-tile')).toHaveLength(40)
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'My properties' }))
    expect(screen.getByRole('dialog', { name: 'My properties' })).toBeTruthy()
  })

  it('clicks the physical dice and settles on the server-generated faces', async () => {
    let time = 1_000_000
    const rolls = [6, 6, 1, 1, 2, 3]
    const manager = new PropertyGameManager({ now: () => time, die: () => rolls.shift() ?? 1 })
    ready(manager)
    manager.start(room, 'host')
    time += 4500
    manager.tick({ ...room, status: 'PLAYING' })
    context.match = manager.getMatch(room.code)
    context.action = (action) => manager.act({ ...room, status: 'PLAYING' }, 'host', action)
    render(<OwnItMatch room={{ ...room, status: 'PLAYING' }} playerId="host" notify={() => undefined} />)
    const dice = await screen.findByRole('button', { name: 'Roll two dice' })
    expect(dice.hasAttribute('disabled')).toBe(false)
    fireEvent.click(dice)
    fireEvent.click(dice)
    await waitFor(() => expect(dice.hasAttribute('disabled')).toBe(true))
    await waitFor(() => expect(dice.querySelectorAll('[data-face="2"], [data-face="3"]')).toHaveLength(2), { timeout: 2500 })
    expect(manager.getMatch(room.code)?.dice).toEqual([2, 3])
    expect(manager.getMatch(room.code)?.players.host.position).toBe(5)
    context.action = null
  })

  it('shows a drawn card in the board centre with the drawing player colour', async () => {
    const manager = new PropertyGameManager({ die: () => 1 })
    ready(manager)
    context.match = { ...manager.start(room, 'host'), settings: { ...CLASSIC_SETTINGS, mapId: 'south_africa' }, lastCard: CARDS[0], lastCardPlayerId: 'guest', lastCardAt: Date.now() }
    render(<OwnItMatch room={{ ...room, status: 'PLAYING' }} playerId="host" notify={() => undefined} />)
    const board = await screen.findByRole('grid', { name: 'South Africa Own It! game board' })
    expect(board.textContent).toContain('Bo-Kaap')
    const card = board.querySelector('.oi-board-card') as HTMLElement
    expect(card.textContent).toContain('CHANCE')
    expect(card.textContent).toContain(CARDS[0].text)
    expect(card.style.getPropertyValue('--card-player-color')).toBe('#24b47e')
  })

  it('supports keyboard dice activation with reduced motion', async () => {
    const originalMatchMedia = window.matchMedia
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })
    let calls = 0
    function DiceHarness() {
      const [result, setResult] = useState<{ dice: [number, number]; at: number } | null>(null)
      return <TabletopDice dice={result?.dice ?? null} rollAt={result?.at ?? null} canRoll={!result} isJailRoll={false} onRoll={async () => { calls += 1; setResult({ dice: [4, 6], at: Date.now() }); return true }} />
    }
    try {
      render(<DiceHarness />)
      const user = userEvent.setup()
      const button = screen.getByRole('button', { name: 'Roll two dice' })
      button.focus()
      await user.keyboard('{Enter}')
      await waitFor(() => expect(button.querySelectorAll('[data-face="4"], [data-face="6"]')).toHaveLength(2))
      expect(calls).toBe(1)
      expect(button.closest('.oi-dice-tray')?.classList.contains('is-rolling')).toBe(false)
    } finally {
      window.matchMedia = originalMatchMedia
    }
  })
})
