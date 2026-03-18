'use client'

import { useEffect, useState } from 'react'
import Nav from '@/components/Nav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState('admin')
  const [name, setName] = useState('User')

  useEffect(() => {
    // Read from cookies
    const cookies = document.cookie.split(';').reduce((acc, c) => {
      const [k, v] = c.trim().split('=')
      acc[k] = v
      return acc
    }, {} as Record<string, string>)

    if (cookies.mm_user_role) setRole(cookies.mm_user_role)
    if (cookies.mm_user_name) setName(decodeURIComponent(cookies.mm_user_name))
  }, [])

  return (
    <div>
      <Nav role={role} userName={name} />
      <main className="main-content" style={{ padding: '16px' }}>
        <style>{`
          @media (min-width: 768px) {
            .main-content {
              margin-left: 272px !important;
              margin-right: 32px !important;
              padding: 32px 0 !important;
            }
          }
        `}</style>
        {children}
      </main>
    </div>
  )
}
