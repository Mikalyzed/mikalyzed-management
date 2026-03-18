'use client'

import Nav from '@/components/Nav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Nav role="admin" userName="Fernando" />
      <main className="main-content p-4 md:py-8 md:px-10 md:pr-16" style={{ marginLeft: '0px' }}>
        <style>{`
          @media (min-width: 768px) {
            .main-content {
              margin-left: 272px !important;
            }
          }
        `}</style>
        {children}
      </main>
    </div>
  )
}
