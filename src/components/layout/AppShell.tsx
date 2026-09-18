import { Link, Outlet, useLocation } from 'react-router-dom'

function Brand({ inRoom }: { inRoom: boolean }) {
  const contents = (
    <>
      <span className="brand__mark" aria-hidden="true">
        <span>!</span>
      </span>
      <span>party<span className="brand__second">popper</span><sup>✳</sup></span>
    </>
  )

  return inRoom ? (
    <span className="brand" title="Use Leave room before returning home">
      {contents}
    </span>
  ) : (
    <Link className="brand" to="/" aria-label="Party Popper home">
      {contents}
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
  const location = useLocation()
  const inRoom = location.pathname.startsWith('/room/')

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AmbientBackground />
      <header className="site-header">
        <Brand inRoom={inRoom} />
        <div className="header-note"><span aria-hidden="true">●</span> GOOD FRIENDS. GREAT GAMES.</div>
        <span className="site-header__tag">✦ Instant game night</span>
      </header>
      <main id="main-content" className="page-shell">
        <Outlet />
      </main>
      <footer className="site-footer"><span>SMALL SCREENS. BIG ENERGY.</span><span>Made for your favourite people <span aria-hidden="true">✳</span></span></footer>
    </div>
  )
}
