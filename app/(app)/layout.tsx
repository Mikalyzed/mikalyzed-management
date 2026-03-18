'use client'

import Nav from '@/components/Nav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="md:ml-56">
      <Nav role="admin" userName="Fernando" />
      <main className="main-content p-4 md:p-6 max-w-7xl mx-auto">
        {children}
      </main>
    </div>
  )
}
