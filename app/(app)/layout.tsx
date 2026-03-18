'use client'

import Nav from '@/components/Nav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="md:ml-[240px]">
      <Nav role="admin" userName="Fernando" />
      <main className="main-content p-4 md:p-8 max-w-6xl">
        {children}
      </main>
    </div>
  )
}
