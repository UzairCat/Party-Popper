import { Link } from 'react-router-dom'

export function HomePage() {
  return (
    <section className="home-page page-enter">
      <div className="home-hero">
        <p className="eyebrow eyebrow--accent">Your game night starts here</p>
        <h1>
          Party games.
          <span>One room.</span>
        </h1>
        <p className="home-hero__copy">
          Create a room, invite your friends, and jump into quick multiplayer games together.
        </p>

        <div className="home-actions">
          <Link className="action-card action-card--primary" to="/create">
            <span className="action-card__icon" aria-hidden="true">
              ✦
            </span>
            <span>
              <strong>Create a room</strong>
              <small>Start a new party</small>
            </span>
            <span className="action-card__arrow" aria-hidden="true">
              →
            </span>
          </Link>
          <Link className="action-card action-card--secondary" to="/join">
            <span className="action-card__icon" aria-hidden="true">
              #
            </span>
            <span>
              <strong>Join a room</strong>
              <small>I have a code</small>
            </span>
            <span className="action-card__arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </div>

        <div className="trust-row" aria-label="Party Popper benefits">
          <span>✓ No account</span>
          <span>✓ Phone friendly</span>
          <span>✓ Made for groups</span>
        </div>
      </div>

      <div className="home-preview" aria-hidden="true">
        <div className="preview-card preview-card--back">
          <span>🐸</span>
        </div>
        <div className="preview-card preview-card--middle">
          <span>😎</span>
        </div>
        <div className="preview-card preview-card--front">
          <span className="preview-card__crown">♛</span>
          <span className="preview-card__avatar">🤖</span>
          <strong>Everyone’s in!</strong>
          <small>Room J7KQ</small>
          <div className="preview-ready">3 players ready</div>
        </div>
      </div>
    </section>
  )
}
