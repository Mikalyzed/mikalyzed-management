import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Data deletion status — Mikalyzed Management',
  description: 'Status of your data deletion request from Mikalyzed Management.',
}

export default async function DataDeletionStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  const params = await searchParams
  const code = params.code

  return (
    <div style={{
      maxWidth: 560, margin: '0 auto', padding: '80px 24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Helvetica Neue", sans-serif',
      color: '#1a1a1a', lineHeight: 1.6,
    }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 14 }}>
        Data deletion confirmed
      </h1>
      <p style={{ fontSize: 15, marginBottom: 20 }}>
        Your request to delete your data from Mikalyzed Management has been received and processed.
      </p>
      <p style={{ fontSize: 14, color: '#6b6b6b', marginBottom: 14 }}>
        We have removed:
      </p>
      <ul style={{ fontSize: 14, color: '#6b6b6b', paddingLeft: 24, marginBottom: 24 }}>
        <li>Your Instagram OAuth connection record</li>
        <li>Any Instagram direct message history we held linked to your IG-scoped user ID</li>
        <li>Your Instagram handle and IG-scoped ID tags on any contact record</li>
      </ul>
      {code && (
        <div style={{
          padding: '14px 16px', borderRadius: 10, background: '#f8fafc',
          border: '1px solid #e2e8f0', fontSize: 13,
        }}>
          <p style={{ color: '#6b6b6b', marginBottom: 4 }}>Confirmation code</p>
          <p style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 600 }}>{code}</p>
        </div>
      )}
      <p style={{ fontSize: 13, color: '#9a9a9a', marginTop: 30 }}>
        Need anything else? Email{' '}
        <a href="mailto:it@mikalyzed.com" style={{ color: '#2563eb', textDecoration: 'none' }}>it@mikalyzed.com</a>
        .
      </p>
      <p style={{ fontSize: 13, color: '#9a9a9a', marginTop: 30, borderTop: '1px solid #e8e8e4', paddingTop: 20 }}>
        <a href="/privacy" style={{ color: '#6b6b6b', marginRight: 16 }}>Privacy Policy</a>
        <a href="/terms" style={{ color: '#6b6b6b' }}>Terms of Service</a>
      </p>
    </div>
  )
}
