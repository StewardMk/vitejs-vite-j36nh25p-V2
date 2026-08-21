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
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: 'var(--color-primary)',
            color: '#FFFFFF',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            boxShadow: '0 5px 12px rgba(23, 105, 224, 0.20)',
          }}
        >
          OET
        </span>
        <span>Training Centre</span>
      </Link>
    </nav>
  )
}

export default SiteNav