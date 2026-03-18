'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type NavItem = { href: string; label: string }

const NAV_ITEMS: Record<string, NavItem[]> = {
  admin: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/vehicles', label: 'Recon Board' },
    { href: '/transport', label: 'Transport' },
    { href: '/reports', label: 'Reports' },
    { href: '/team', label: 'Team' },
  ],
  mechanic: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/tasks', label: 'My Tasks' },
    { href: '/vehicles', label: 'Board' },
  ],
  detailer: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/tasks', label: 'My Tasks' },
    { href: '/vehicles', label: 'Board' },
  ],
  content: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/tasks', label: 'My Tasks' },
    { href: '/vehicles', label: 'Board' },
  ],
  sales: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/transport/new', label: 'New Request' },
    { href: '/transport/mine', label: 'My Requests' },
  ],
  coordinator: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/transport', label: 'Queue' },
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
        {/* Logo */}
        <div className="px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold"
              style={{ background: '#dffd6e', color: '#1a1a1a' }}>
              M
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: '#ffffff' }}>MIKALYZED</p>
              <p className="text-xs" style={{ color: '#666' }}>Auto Boutique</p>
            </div>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-4 flex flex-col gap-0">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${isActive(item.href) ? 'active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* User */}
        <div className="px-4 py-5 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: '#dffd6e', color: '#1a1a1a' }}>
                {userName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: '#fff' }}>{userName}</p>
                <p className="text-xs capitalize" style={{ color: '#666' }}>{role}</p>
              </div>
            </div>
            <a href="/api/auth/logout" className="text-xs" style={{ color: '#666', minHeight: 'auto' }}>
              Sign Out
            </a>
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
            <span className="nav-icon">●</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  )
}
