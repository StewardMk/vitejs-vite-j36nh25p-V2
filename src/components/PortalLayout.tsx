import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

export type IconName =
  | 'home' | 'folder' | 'key' | 'chart' | 'users' | 'book' | 'card' | 'upload'
  | 'tests' | 'logout' | 'menu' | 'trophy' | 'clock' | 'target' | 'external' | 'file'

const PATHS: Record<IconName, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  folder: 'M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V6z',
  key: 'M14 10a4 4 0 11-3.9 5L3 22v-3l1-1h2v-2h2l2.1-2.1A4 4 0 0114 10zm1 1h.01',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  users: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8',
  book: 'M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5v14zM20 17v4H6.5A2.5 2.5 0 014 18.5',
  card: 'M2 7a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V7zM2 10h20',
  upload: 'M12 16V4m0 0l-4 4m4-4l4 4M4 20h16',
  tests: 'M9 11l3 3 8-8M4 12a8 8 0 108-8',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  menu: 'M3 6h18M3 12h18M3 18h18',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM17 5h3v2a3 3 0 01-3 3M7 5H4v2a3 3 0 003 3',
  clock: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  target: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 16a4 4 0 100-8 4 4 0 000 8zM12 12h.01',
  external: 'M14 3h7v7M10 14L21 3M19 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h5',
  file: 'M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5zM14 3v5h5',
}

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}

export interface NavItem {
  key: string
  label: string
  icon: IconName
  badge?: number
  /** Renders a router link instead of switching the in-page section. */
  to?: string
}

export interface NavGroup {
  label?: string
  items: NavItem[]
}

interface PortalLayoutProps {
  portalName: string
  groups: NavGroup[]
  active: string
  onSelect: (key: string) => void
  userName: string
  userRole: string
  onSignOut: () => void
  title: string
  subtitle?: string
  actions?: ReactNode
  wide?: boolean
  children: ReactNode
}

function PortalLayout({
  portalName, groups, active, onSelect, userName, userRole, onSignOut, title, subtitle, actions, wide, children,
}: PortalLayoutProps) {
  const [open, setOpen] = useState(false)
  const initial = (userName || '?').trim().charAt(0).toUpperCase()

  return (
    <div className="portal">
      <aside className={`portal-sidebar ${open ? 'open' : ''}`}>
        <Link to="/" className="portal-brand">
          <img src="/logo.png" alt="" />
          <div>
            <strong>YouEngage OET</strong>
            <span>{portalName}</span>
          </div>
        </Link>
        <nav className="portal-nav">
          {groups.map((g, gi) => (
            <div key={gi}>
              {g.label && <div className="portal-nav-label">{g.label}</div>}
              {g.items.map((item) =>
                item.to ? (
                  <Link key={item.key} to={item.to} className="portal-nav-item" onClick={() => setOpen(false)}>
                    <Icon name={item.icon} />
                    {item.label}
                  </Link>
                ) : (
                  <button
                    key={item.key}
                    className={`portal-nav-item ${active === item.key ? 'active' : ''}`}
                    onClick={() => { onSelect(item.key); setOpen(false) }}
                  >
                    <Icon name={item.icon} />
                    {item.label}
                    {item.badge ? <span className="portal-nav-badge">{item.badge}</span> : null}
                  </button>
                )
              )}
            </div>
          ))}
        </nav>
        <div className="portal-sidebar-foot">
          <div className="portal-user">
            <div className="portal-avatar">{initial}</div>
            <div>
              <strong>{userName}</strong>
              <span>{userRole}</span>
            </div>
          </div>
          <button className="portal-nav-item" onClick={onSignOut}>
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      </aside>
      <div className={`portal-backdrop ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />
      <div className="portal-main">
        <header className="portal-topbar">
          <button className="portal-menu-btn" onClick={() => setOpen(true)} aria-label="Open menu">
            <Icon name="menu" />
          </button>
          <div>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="portal-topbar-actions">{actions}</div>}
        </header>
        <main className={`portal-content ${wide ? 'wide' : ''}`}>{children}</main>
      </div>
    </div>
  )
}

export function StatCard({ icon, tone, label, value, sub }: { icon: IconName; tone?: 'green' | 'amber' | 'red'; label: string; value: string | number; sub?: string }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone ?? ''}`}><Icon name={icon} /></div>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  )
}

export default PortalLayout
