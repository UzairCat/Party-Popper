import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="not-found page-enter">
      <div className="not-found__mark" aria-hidden="true">
        ?
      </div>
      <p className="eyebrow eyebrow--accent">404</p>
      <h1>This party moved.</h1>
      <p>That page doesn’t exist, but game night is still on.</p>
      <Link className="button button--primary button--large" to="/">
        Back home
      </Link>
    </section>
  )
}
