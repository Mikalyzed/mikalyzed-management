'use client'

import { useEffect, useState } from 'react'
import Nav from '@/components/Nav'
import VoicePhone from '@/components/VoicePhone'
import AskAI from '@/components/AskAI'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState('admin')
  const [name, setName] = useState('User')
  // Embedded mode: when a page is loaded inside an in-app peek modal
  // (iframe on the deal page), drop the nav/margins/global widgets and
  // render content only.
  const [embedded, setEmbedded] = useState(false)

  useEffect(() => {
    try {
      if (window.self !== window.top) setEmbedded(true)
    } catch {
      setEmbedded(true)
    }
  }, [])

  // Resize pause: while the window is being resized, every backdrop-filter
  // element recomposites per frame. Flag <html> so globals.css can drop the
  // glass filters (same pattern as the data-scrolling scroll pause), restore
  // ~150ms after the last resize event.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null
    const onResize = () => {
      document.documentElement.setAttribute('data-resizing', '1')
      if (t) clearTimeout(t)
      t = setTimeout(() => document.documentElement.removeAttribute('data-resizing'), 150)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (t) clearTimeout(t)
      document.documentElement.removeAttribute('data-resizing')
    }
  }, [])

  useEffect(() => {
    // Cookies give an instant first paint…
    const cookies = document.cookie.split(';').reduce((acc, c) => {
      const [k, v] = c.trim().split('=')
      acc[k] = v
      return acc
    }, {} as Record<string, string>)

    if (cookies.mm_user_role) setRole(cookies.mm_user_role)
    if (cookies.mm_user_name) setName(decodeURIComponent(cookies.mm_user_name))

    // …but the cookie is stamped at login and goes stale when an admin
    // changes someone's role. The server is the truth — refresh from it so
    // the nav always matches the CURRENT role without needing a re-login.
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => {
        if (d.user?.role) setRole(d.user.role)
        if (d.user?.name) setName(d.user.name)
      })
      .catch(() => {})
  }, [])

  if (embedded) {
    return (
      <div style={{ background: 'var(--bg-primary, #f8f8f6)', minHeight: '100vh' }}>
        <main style={{ padding: 18 }}>{children}</main>
      </div>
    )
  }

  return (
    <div>
      <Nav role={role} userName={name} />
      {/* Soft mesh-gradient backdrop — single source for the glass pages.
          Full-bleed: the sidebar is opaque, so the strip behind it is invisible
          anyway. No filter here on purpose: the old blur(80px) forced the GPU
          to re-rasterize the whole viewport on every resize/collapse frame.
          The wide radial falloffs below reproduce the same soft wash. */}
      <div aria-hidden className="app-mesh-bg" />
      <style>{`
        .app-mesh-bg {
          position: fixed;
          top: 0; right: 0; bottom: 0; left: 0;
          background:
            radial-gradient(at 24% 18%, hsla(220, 92%, 72%, 0.17) 0px, transparent 64%),
            radial-gradient(at 88% 6%, hsla(280, 82%, 68%, 0.15) 0px, transparent 64%),
            radial-gradient(at 74% 82%, hsla(190, 72%, 78%, 0.11) 0px, transparent 58%),
            radial-gradient(at 22% 92%, hsla(340, 77%, 72%, 0.13) 0px, transparent 64%);
          z-index: -1;
          pointer-events: none;
        }
        @media (min-width: 768px) {
          .main-content {
            margin-left: 220px !important;
            margin-right: 16px !important;
            padding: 24px 18px !important;
            transition: margin-left 0.22s ease;
          }
          /* Collapsed icon rail — Nav toggles this class on <html>. */
          html.nav-collapsed .main-content { margin-left: 104px !important; }
          /* Deal focus mode — the contract page hides the global sidebar and
             mounts its own 220px deal rail. The doubled selector outranks
             html.nav-collapsed even when both classes are on <html>. */
          html.deal-focus .global-sidebar { display: none !important; }
          html.deal-focus .main-content,
          html.deal-focus.nav-collapsed .main-content { margin-left: 220px !important; }
        }
      `}</style>
      <main className="main-content" style={{ padding: '16px 16px', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 88px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}>
        {children}
      </main>
      <VoicePhone />
      <AskAI />
    </div>
  )
}
