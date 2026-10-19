import { Link } from 'react-router-dom'

/**
 * Minimal top bar with just the OET Training Centre logo, linking back to
 * the homepage ("/"). Used on utility/internal pages (tutor login, admin
 * upload) that don't need the full marketing nav's extra links.
 */
function SiteNav() {
  return (
    <nav className="nav">
      <Link
        to="/"
        className="nav-logo"
        style={{ display: 'flex', alignItems: 'center', gap: 10 }}
      >
        <img src="/logo.png" alt="YouEngage OET Training Centre" width={40} height={40} style={{ display: 'block', borderRadius: '50%' }} />
        <span>YouEngage OET</span>
      </Link>
    </nav>
  )
}

export default SiteNav