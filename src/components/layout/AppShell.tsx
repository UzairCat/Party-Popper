import { Link, Outlet } from 'react-router-dom'

function Brand() {
  return (
    <Link className="brand" to="/" aria-label="Party Popper home">
      <span className="brand__mark" aria-hidden="true">
        <span>!</span>
      </span>
      <span>Party Popper</span>
    </Link>
  )
}

function AmbientBackground() {
  return (
    <div className="ambient" aria-hidden="true">
      <span className="ambient__shape ambient__shape--one">★</span>
      <span className="ambient__shape ambient__shape--two">●</span>
      <span className="ambient__shape ambient__shape--three">▲</span>
      <span className="ambient__shape ambient__shape--four">?</span>
      <span className="ambient__shape ambient__shape--five">◆</span>
    </div>
  )
}

export function AppShell() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AmbientBackground />
      <header className="site-header">
        <Brand />
        <span className="site-header__tag">No account needed</span>
      </header>
      <main id="main-content" className="page-shell">
        <Outlet />
      </main>
    </div>
  )
}
