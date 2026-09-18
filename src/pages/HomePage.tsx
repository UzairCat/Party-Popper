import { Link } from 'react-router-dom'
import { PartyArtwork } from '../components/layout/PartyArtwork'

export function HomePage() {
  return (
    <div className="home-experience page-enter">
    <section className="home-page">
      <div className="home-hero">
        <p className="eyebrow eyebrow--accent home-kicker"><span aria-hidden="true">✳</span> THE GROUP CHAT HAS PLANS.</p>
        <h1>
          Party games.
          <span>One room.</span>
        </h1>
        <p className="home-hero__copy">
          Your people. A little friendly competition. A whole lot of “one more round.” Let’s get everyone in.
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
          <span>↗ No downloads</span>
          <span>◎ No account</span>
          <span>✦ Just your friends</span>
        </div>
      </div>

      <PartyArtwork />
    </section>
    <div className="party-ribbon" aria-hidden="true"><span>LESS SCROLLING</span> ✳ <span>MORE PLAYING</span> ✳ <span>GOOD COMPANY</span> ✳ <span>GREAT RIVALRIES</span> ✳</div>
    <section className="how-to-party" aria-labelledby="how-title">
      <div><p className="eyebrow">NO MANUAL REQUIRED</p><h2 id="how-title">Three steps.<br />Endless banter.</h2></div>
      <article><span>01 /</span><h3>Make some room.</h3><p>Start a party and claim your spot. No sign-ups, no fuss.</p></article>
      <article><span>02 /</span><h3>Send the code.</h3><p>Friends join from their own phones. Same room, wherever you are.</p></article>
      <article><span>03 /</span><h3>Pick your game.</h3><p>Set the rules together. Then let the friendly competition begin.</p></article>
    </section>
    </div>
  )
}
