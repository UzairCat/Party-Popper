import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'

vi.mock('./lib/socket', () => ({
  socket: {
    connected: false,
    on: vi.fn(),
    off: vi.fn(),
  },
  ensureSocketConnected: vi.fn(),
  disconnectSocket: vi.fn(),
  inspectRoom: vi.fn(async (roomCode: string) => ({
    ok: true,
    data: { code: roomCode, playerCount: 1, maxPlayers: 8 },
  })),
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
  reconnectRoom: vi.fn(),
  updateRoomSettings: vi.fn(),
  kickPlayer: vi.fn(),
  transferHost: vi.fn(),
  leaveRoom: vi.fn(),
  closeRoom: vi.fn(),
  openGameSelection: vi.fn(),
  selectGame: vi.fn(),
  returnToLobby: vi.fn(),
}))

function renderRoute(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  )
}

describe('Party Popper routes', () => {
  it('shows both primary paths on the home page', () => {
    renderRoute('/')

    expect(screen.getByRole('heading', { name: /party games.*one room/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /create a room/i })).toHaveAttribute('href', '/create')
    expect(screen.getByRole('link', { name: /join a room/i })).toHaveAttribute('href', '/join')
  })

  it('normalises a room code before moving to player setup', async () => {
    const user = userEvent.setup()
    renderRoute('/join')

    const codeInput = screen.getByRole('textbox', { name: /room code/i })
    await user.type(codeInput, 'j 7kq')
    expect(codeInput).toHaveValue('J7KQ')

    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(
      await screen.findByRole('heading', { name: /join the party/i }),
    ).toBeInTheDocument()
  })

  it('validates a host name before entering the lobby', async () => {
    const user = userEvent.setup()
    renderRoute('/create')

    await user.click(screen.getByRole('button', { name: /create room/i }))
    expect(screen.getByText('Enter a name first.')).toBeInTheDocument()
  })
})
