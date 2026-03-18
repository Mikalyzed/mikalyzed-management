'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type NavItem = {
  href: string
  label: string
  icon: string
}

const NAV_ITEMS: Record<string, NavItem[]> = {
  admin: [
    { href: '/dashboard', label: 'Home', icon: '🏠' },
    { href: '/vehicles', label: 'Board', icon: '📋' },
    { href: '/transport', label: 'Transport', icon: '🚚' },
    { href: '/reports', label: 'Reports', icon: '📈' },
  ],
  mechanic: [
    { href: '/dashboard', label: 'Home', icon: '🏠' },
    { href: '/tasks', label: 'My Tasks', icon: '🔧' },
    { href: '/vehicles', label: 'Board', icon: '📋' },
  ],
  detailer: [
    { href: '/dashboard', label: 'Home', icon: '🏠' },
    { href: '/tasks', label: 'My Tasks', icon: '✨' },
    { href: '/vehicles', label: 'Board', icon: '📋' },
  ],
  content: [
    { href: '/dashboard', label: 'Home', icon: '🏠' },
    { href: '/tasks', label: 'My Tasks', icon: '📸' },
    { href: '/vehicles', label: 'Board', icon: '📋' },
  ],
  sales: [
    { href: '/dashboard', label: 'Home', icon: '🏠' },
    { href: '/transport/new', label: 'Request', icon: '🚚' },
    { href: '/transport/mine', label: 'My Requests', icon: '📦' },
  ],
  coordinator: [
    { href: '/dashboard', label: 'Home', icon: '🏠' },
    { href: '/transport', label: 'Queue', icon: '🚚' },
  ],
}

export default function Nav({ role, userName }: { role: string; userName: string }) {
  const pathname = usePathname()
  const items = NAV_ITEMS[role] || NAV_ITEMS.sales

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 fixed left-0 top-0 bottom-0 border-r"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
        <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h1 className="text-lg font-bold">🔧 Mikalyzed</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {userName} · <span className="capitalize">{role}</span>
          </p>
        </div>
        <nav className="flex-1 p-3 flex flex-col gap-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                color: pathname === item.href ? 'var(--accent)' : 'var(--text-secondary)',
                background: pathname === item.href ? 'rgba(59,130,246,0.1)' : 'transparent',
              }}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <Link
            href="/api/auth/logout"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            🚪 Sign Out
          </Link>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="bottom-nav md:hidden">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={pathname === item.href ? 'active' : ''}
          >
            <span style={{ fontSize: '20px' }}>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  )
}
