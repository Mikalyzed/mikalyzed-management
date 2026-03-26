'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import NotificationBell from './NotificationBell'

type NavItem = { href: string; label: string; icon: string }
type NavGroup = { label: string; icon: string; children: NavItem[] }
type NavEntry = NavItem | NavGroup

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry
}

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
  leads: 'M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6',
  contacts: 'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z',
  pipelines: 'M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z',
  sales: 'M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z',
  chevron_down: 'm19.5 8.25-7.5 7.5-7.5-7.5',
  chevron_right: 'm8.25 4.5 7.5 7.5-7.5 7.5',
}

const ICON_MAP: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/vehicles': 'board',
  '/transport': 'transport',
  '/transport/new': 'newrequest',
  '/transport/mine': 'myrequests',
  '/external': 'external',
  '/leads': 'leads',
  '/contacts': 'contacts',
  '/pipelines': 'pipelines',
  '/calendar': 'calendar',
  '/events': 'events',
  '/reports': 'reports',
  '/team': 'team',
  '/settings': 'settings',
  '/tasks': 'tasks',
  '/task-board': 'tasks',
  '/content-schedule-2': 'tasks',
  '/mechanic-schedule': 'calendar',
}

function NavIcon({ name, size = 20 }: { name: string; size?: number }) {
  const d = ICONS[name] || ICONS.dashboard
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

const NAV_ITEMS: Record<string, NavEntry[]> = {
  admin: [
    { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { href: '/vehicles', label: 'Recon Board', icon: 'board' },
    { href: '/transport', label: 'Transport', icon: 'transport' },
    {
      label: 'Sales', icon: 'sales', children: [
        { href: '/leads', label: 'Leads', icon: 'leads' },
        { href: '/contacts', label: 'Contacts', icon: 'contacts' },
        { href: '/pipelines', label: 'Pipelines', icon: 'pipelines' },
      ],
    },
    { href: '/task-board', label: 'Content Schedule', icon: 'tasks' },
    { href: '/content-schedule-2', label: 'Content Board', icon: 'tasks' },
    { href: '/mechanic-schedule', label: 'Mechanic Schedule', icon: 'calendar' },
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
    { href: '/mechanic-schedule', label: 'My Schedule', icon: 'calendar' },
    { href: '/transport', label: 'Transport', icon: 'transport' },
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
    { href: '/task-board', label: 'Content Schedule', icon: 'tasks' },
    { href: '/content-schedule-2', label: 'Content Board', icon: 'tasks' },
  ],
  sales: [
    { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { href: '/leads', label: 'Leads', icon: 'leads' },
    { href: '/contacts', label: 'Contacts', icon: 'contacts' },
    { href: '/transport/new', label: 'New Request', icon: 'newrequest' },
  ],
  coordinator: [
    { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { href: '/transport', label: 'Queue', icon: 'queue' },
  ],
}

function NavLink({ item, active, onClick, indent = false }: { item: NavItem; active: boolean; onClick?: () => void; indent?: boolean }) {
  return (
    <Link href={item.href} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: indent ? 10 : 14,
      padding: indent ? '8px 14px 8px 48px' : '10px 14px', borderRadius: 10,
      fontSize: indent ? 13 : 14, fontWeight: active ? 600 : 500,
      color: active ? '#dffd6e' : '#808080',
      background: active ? 'rgba(223, 253, 110, 0.1)' : 'transparent',
      textDecoration: 'none', transition: 'all 0.15s ease', minHeight: indent ? 36 : 42,
    }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#b0b0b0' } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#808080' } }}
    >
      {!indent && <NavIcon name={ICON_MAP[item.href] || item.icon} size={20} />}
      {item.label}
    </Link>
  )
}

function NavGroupSection({ group, pathname, onClick }: { group: NavGroup; pathname: string; onClick?: () => void }) {
  const childPaths = group.children.map(c => c.href)
  const hasActive = childPaths.some(h => pathname === h || pathname.startsWith(h + '/'))
  const [open, setOpen] = useState(hasActive)

  // Auto-open when navigating to a child
  useEffect(() => { if (hasActive) setOpen(true) }, [hasActive])

  return (
    <div>
      <button onClick={() => setOpen(!open)} style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '10px 14px', borderRadius: 10, width: '100%',
        fontSize: 14, fontWeight: hasActive ? 600 : 500, border: 'none', cursor: 'pointer',
        color: hasActive ? '#dffd6e' : '#808080',
        background: 'transparent',
        transition: 'all 0.15s ease', minHeight: 42,
      }}
        onMouseEnter={(e) => { if (!hasActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#b0b0b0' } }}
        onMouseLeave={(e) => { if (!hasActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = hasActive ? '#dffd6e' : '#808080' } }}
      >
        <NavIcon name={group.icon} size={20} />
        <span style={{ flex: 1, textAlign: 'left' }}>{group.label}</span>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          style={{ transition: 'transform 0.2s ease', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        >
          <path d={ICONS.chevron_down} />
        </svg>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {group.children.map(child => (
            <NavLink
              key={child.href}
              item={child}
              active={pathname === child.href || pathname.startsWith(child.href + '/')}
              onClick={onClick}
              indent
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Nav({ role, userName }: { role: string; userName: string }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const items = NAV_ITEMS[role] || NAV_ITEMS.sales
  const isActive = (href: string) => pathname === href || (href !== '/dashboard' && pathname.startsWith(href))

  // Close menu on navigation
  useEffect(() => { setMobileOpen(false) }, [pathname])

  function renderNavEntries(entries: NavEntry[], onItemClick?: () => void) {
    return entries.map((entry, i) => {
      if (isGroup(entry)) {
        return <NavGroupSection key={entry.label} group={entry} pathname={pathname} onClick={onItemClick} />
      }
      return <NavLink key={entry.href} item={entry} active={isActive(entry.href)} onClick={onItemClick} />
    })
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="desktop-sidebar" style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, width: 260,
        background: '#141414', flexDirection: 'column', zIndex: 40,
        display: 'none',
      }}>
        <div style={{ padding: '28px 24px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, background: '#dffd6e', color: '#1a1a1a',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800,
              }}>M</div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: '0.04em', lineHeight: 1.2 }}>MIKALYZED</p>
                <p style={{ fontSize: 11, color: '#555', fontWeight: 500, letterSpacing: '0.02em' }}>Auto Boutique</p>
              </div>
            </div>
            <NotificationBell />
          </div>
        </div>
        <nav style={{ flex: 1, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {renderNavEntries(items)}
        </nav>
        <div style={{ padding: '16px 16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', background: '#dffd6e', color: '#1a1a1a',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
              }}>{userName.charAt(0).toUpperCase()}</div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0' }}>{userName}</p>
                <p style={{ fontSize: 11, color: '#555', textTransform: 'capitalize' }}>{role}</p>
              </div>
            </div>
            <a href="/api/auth/logout" style={{ fontSize: 12, color: '#555', textDecoration: 'none', minHeight: 'auto' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#999' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#555' }}
            >Sign Out</a>
          </div>
        </div>
      </aside>

      {/* Mobile: top bar with hamburger */}
      {!mobileOpen && (
        <div className="mobile-topbar" style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
          background: '#141414', padding: '14px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8, background: '#dffd6e', color: '#1a1a1a',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800,
            }}>M</div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '0.04em' }}>MIKALYZED</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <NotificationBell />
            <button onClick={() => setMobileOpen(true)} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: '#fff',
            }}>
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Mobile: backdrop */}
      <div onClick={() => setMobileOpen(false)} className="mobile-only" style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 59,
        opacity: mobileOpen ? 1 : 0, pointerEvents: mobileOpen ? 'auto' : 'none',
        transition: 'opacity 0.25s ease',
      }} />
      {/* Mobile: side drawer */}
      <aside className="mobile-only" style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: 280, zIndex: 60,
        background: '#141414', display: 'flex', flexDirection: 'column',
        transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease',
        paddingTop: 'env(safe-area-inset-top)',
      }}>
        <div style={{ padding: '20px 20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, background: '#dffd6e', color: '#1a1a1a',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800,
            }}>M</div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: '0.04em', lineHeight: 1.2 }}>MIKALYZED</p>
              <p style={{ fontSize: 10, color: '#555', fontWeight: 500 }}>Auto Boutique</p>
            </div>
          </div>
          <button onClick={() => setMobileOpen(false)} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: '#666',
          }}>
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav style={{ flex: 1, padding: '4px 10px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {renderNavEntries(items, () => setMobileOpen(false))}
        </nav>

        <div style={{ padding: '14px 16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%', background: '#dffd6e', color: '#1a1a1a',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
              }}>{userName.charAt(0).toUpperCase()}</div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0' }}>{userName}</p>
                <p style={{ fontSize: 11, color: '#555', textTransform: 'capitalize' }}>{role}</p>
              </div>
            </div>
            <a href="/api/auth/logout" style={{ fontSize: 12, color: '#555', textDecoration: 'none' }}>Sign Out</a>
          </div>
        </div>
      </aside>
    </>
  )
}
