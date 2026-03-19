'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type NavItem = { href: string; label: string; icon: string }

// SVG icon paths (heroicons outline style)
const ICONS: Record<string, string> = {
  dashboard: 'M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z',
  board: 'M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z',
  transport: 'M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12',
  external: 'M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085',
  reports: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z',
  team: 'M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z',
  settings: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  tasks: 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  newrequest: 'M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  myrequests: 'M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z',
  queue: 'M3.75 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5',
  calendar: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5',
  events: 'M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z',
}

const ICON_MAP: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/vehicles': 'board',
  '/transport': 'transport',
  '/transport/new': 'newrequest',
  '/transport/mine': 'myrequests',
  '/external': 'external',
  '/calendar': 'calendar',
  '/events': 'events',
  '/reports': 'reports',
  '/team': 'team',
  '/settings': 'settings',
  '/tasks': 'tasks',
}

function NavIcon({ href, size = 20 }: { href: string; size?: number }) {
  const iconKey = ICON_MAP[href] || 'dashboard'
  const d = ICONS[iconKey]
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

const NAV_ITEMS: Record<string, NavItem[]> = {
  admin: [
    { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { href: '/vehicles', label: 'Recon Board', icon: 'board' },
    { href: '/transport', label: 'Transport', icon: 'transport' },
    { href: '/external', label: 'External Repairs', icon: 'external' },
    { href: '/calendar', label: 'Calendar', icon: 'calendar' },
    { href: '/events', label: 'Events', icon: 'events' },
    { href: '/reports', label: 'Reports', icon: 'reports' },
    { href: '/team', label: 'Team', icon: 'team' },
    { href: '/settings', label: 'Settings', icon: 'settings' },
  ],
  mechanic: [
    { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { href: '/tasks', label: 'My Tasks', icon: 'tasks' },
    { href: '/vehicles', label: 'Board', icon: 'board' },
  ],
  detailer: [
    { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { href: '/tasks', label: 'My Tasks', icon: 'tasks' },
    { href: '/vehicles', label: 'Board', icon: 'board' },
  ],
  content: [
    { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { href: '/tasks', label: 'My Tasks', icon: 'tasks' },
    { href: '/vehicles', label: 'Board', icon: 'board' },
  ],
  sales: [
    { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { href: '/transport/new', label: 'New Request', icon: 'newrequest' },
    { href: '/transport/mine', label: 'My Requests', icon: 'myrequests' },
  ],
  coordinator: [
    { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { href: '/transport', label: 'Queue', icon: 'queue' },
  ],
}

export default function Nav({ role, userName }: { role: string; userName: string }) {
  const pathname = usePathname()
  const items = NAV_ITEMS[role] || NAV_ITEMS.sales
  const isActive = (href: string) => pathname === href || (href !== '/dashboard' && pathname.startsWith(href))

  return (
    <>
      {/* Desktop sidebar */}
      <aside style={{
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        width: 260,
        background: '#141414',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 40,
      }} className="hidden md:flex">
        {/* Logo */}
        <div style={{ padding: '28px 24px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: '#dffd6e',
              color: '#1a1a1a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 15,
              fontWeight: 800,
            }}>M</div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: '0.04em', lineHeight: 1.2 }}>MIKALYZED</p>
              <p style={{ fontSize: 11, color: '#555', fontWeight: 500, letterSpacing: '0.02em' }}>Auto Boutique</p>
            </div>
          </div>
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {items.map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '10px 14px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: active ? 600 : 500,
                  color: active ? '#dffd6e' : '#808080',
                  background: active ? 'rgba(223, 253, 110, 0.1)' : 'transparent',
                  textDecoration: 'none',
                  transition: 'all 0.15s ease',
                  minHeight: 42,
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                    e.currentTarget.style.color = '#b0b0b0'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = '#808080'
                  }
                }}
              >
                <NavIcon href={item.href} size={20} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* User section at bottom */}
        <div style={{
          padding: '16px 16px 20px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: '#dffd6e',
                color: '#1a1a1a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 700,
              }}>
                {userName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0' }}>{userName}</p>
                <p style={{ fontSize: 11, color: '#555', textTransform: 'capitalize' }}>{role}</p>
              </div>
            </div>
            <a href="/api/auth/logout" style={{
              fontSize: 12,
              color: '#555',
              textDecoration: 'none',
              minHeight: 'auto',
              transition: 'color 0.15s',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#999' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#555' }}
            >
              Sign Out
            </a>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="bottom-nav md:hidden">
        {items.slice(0, 5).map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                color: active ? '#1a1a1a' : '#999',
                textDecoration: 'none',
                fontSize: 10,
                fontWeight: active ? 600 : 500,
                minHeight: 44,
                justifyContent: 'center',
                padding: '0 8px',
              }}
            >
              <NavIcon href={item.href} size={22} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
