'use client'

import Nav from '@/components/Nav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Nav role="admin" userName="Fernando" />
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
