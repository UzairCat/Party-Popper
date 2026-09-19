// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CLASSIC_SETTINGS, type MatchSnapshot } from '../shared/property-game'
import type { RoomSnapshot } from '../shared/protocol'
import { PropertyGameManager } from '../server/games/property-game-manager'
import { OwnItSetup } from '../src/games/property/OwnItSetup'
import { OwnItMatch } from '../src/games/property/OwnItMatch'

const context = vi.hoisted(() => ({ match: null as MatchSnapshot | null }))
vi.mock('../src/lib/socket', () => ({
  socket: { on: vi.fn(), off: vi.fn() },
  getPropertySettings: async () => ({ ok: true, data: CLASSIC_SETTINGS }),
  updatePropertySettings: async () => ({ ok: true, data: CLASSIC_SETTINGS }),
  getPropertyMatch: async () => ({ ok: true, data: context.match }),
  propertyAction: async () => ({ ok: false, error: { message: 'Not available in this test.' } }),
  returnToGameSelection: async () => ({ ok: false, error: { message: 'Not available in this test.' } }),
  startPropertyMatch: async () => ({ ok: false, error: { message: 'Not available in this test.' } }),
}))

const room: RoomSnapshot = {
  code: 'ABCD', status: 'GAME_SETUP', selectedGameId: 'property_game', hostId: 'host',
  players: [
    { id: 'host', name: 'Host', avatar: 'robot', colour: 'purple', isConnected: true },
    { id: 'guest', name: 'Guest', avatar: 'frog', colour: 'green', isConnected: true },
  ],
  settings: { maxPlayers: 8, allowLateJoin: false, filterNames: true },
  createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
}

afterEach(cleanup)

describe('Own It! screens', () => {
  it('shows the game menu and disables host settings for guests', () => {
    render(<OwnItSetup room={room} playerId="guest" onRoom={() => undefined} onLeave={() => undefined} notify={() => undefined} />)
    expect(screen.getByRole('heading', { name: 'OWN IT!' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Increase Starting cash' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Waiting for the host to start the game…')).toBeTruthy()
  })

  it('renders every board space, players and property portfolio from a restored match', async () => {
    const manager = new PropertyGameManager({ die: () => 1 })
    context.match = manager.start(room, 'host')
    render(<OwnItMatch room={{ ...room, status: 'PLAYING' }} playerId="host" notify={() => undefined} />)
    await waitFor(() => expect(screen.getByRole('grid', { name: 'Own It! game board' })).toBeTruthy())
    expect(document.querySelectorAll('.oi-tile')).toHaveLength(40)
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'My properties' }))
    expect(screen.getByRole('dialog', { name: 'My properties' })).toBeTruthy()
  })
})
