'use client'

import Nav from '@/components/Nav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Nav role="admin" userName="Fernando" />
      <main className="main-content p-4 md:p-8 md:pl-[264px] max-w-none">
        {children}
      </main>
    </div>
  )
}
