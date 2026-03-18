'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type NavItem = {
  href: string
  label: string
  icon: string
  mobileIcon: string
}

const NAV_ITEMS: Record<string, NavItem[]> = {
  admin: [
    { href: '/dashboard', label: 'Dashboard', icon: '⌂', mobileIcon: '⌂' },
    { href: '/vehicles', label: 'Recon Board', icon: '◫', mobileIcon: '◫' },
    { href: '/transport', label: 'Transport', icon: '⇄', mobileIcon: '⇄' },
    { href: '/reports', label: 'Reports', icon: '◑', mobileIcon: '◑' },
  ],
  mechanic: [
    { href: '/dashboard', label: 'Dashboard', icon: '⌂', mobileIcon: '⌂' },
    { href: '/tasks', label: 'My Tasks', icon: '☰', mobileIcon: '☰' },
    { href: '/vehicles', label: 'Board', icon: '◫', mobileIcon: '◫' },
  ],
  detailer: [
    { href: '/dashboard', label: 'Dashboard', icon: '⌂', mobileIcon: '⌂' },
    { href: '/tasks', label: 'My Tasks', icon: '☰', mobileIcon: '☰' },
    { href: '/vehicles', label: 'Board', icon: '◫', mobileIcon: '◫' },
  ],
  content: [
    { href: '/dashboard', label: 'Dashboard', icon: '⌂', mobileIcon: '⌂' },
    { href: '/tasks', label: 'My Tasks', icon: '☰', mobileIcon: '☰' },
    { href: '/vehicles', label: 'Board', icon: '◫', mobileIcon: '◫' },
  ],
  sales: [
    { href: '/dashboard', label: 'Dashboard', icon: '⌂', mobileIcon: '⌂' },
    { href: '/transport/new', label: 'New Request', icon: '+', mobileIcon: '+' },
    { href: '/transport/mine', label: 'My Requests', icon: '☰', mobileIcon: '☰' },
  ],
  coordinator: [
    { href: '/dashboard', label: 'Dashboard', icon: '⌂', mobileIcon: '⌂' },
    { href: '/transport', label: 'Queue', icon: '☰', mobileIcon: '☰' },
  ],
}

export default function Nav({ role, userName }: { role: string; userName: string }) {
  const pathname = usePathname()
  const items = NAV_ITEMS[role] || NAV_ITEMS.sales
  const isActive = (href: string) => pathname === href || (href !== '/dashboard' && pathname.startsWith(href))

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sidebar hidden md:flex">
        <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
              style={{ background: 'var(--accent)', color: 'white' }}>
              M
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Mikalyzed</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Management</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Menu
          </p>
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${isActive(item.href) ? 'active' : ''}`}
            >
              <span className="icon" style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="px-3 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
              style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}>
              {userName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium">{userName}</p>
              <p className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{role}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="bottom-nav md:hidden">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={isActive(item.href) ? 'active' : ''}
          >
            <span className="nav-icon">{item.mobileIcon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  )
}
