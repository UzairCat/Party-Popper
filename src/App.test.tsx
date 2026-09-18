import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { App } from './App'

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
    expect(screen.getByRole('heading', { name: /pick your player/i })).toBeInTheDocument()
  })

  it('validates a host name before entering the lobby', async () => {
    const user = userEvent.setup()
    renderRoute('/create')

    await user.click(screen.getByRole('button', { name: /create room/i }))
    expect(screen.getByText('Enter a name first.')).toBeInTheDocument()
  })
})
