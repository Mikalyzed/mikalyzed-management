import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — Mikalyzed Management',
  description: 'Privacy policy for the Mikalyzed Management CRM application.',
}

export default function PrivacyPage() {
  return (
    <div style={{
      maxWidth: 760, margin: '0 auto', padding: '60px 24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Helvetica Neue", sans-serif',
      color: '#1a1a1a', lineHeight: 1.6,
    }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ color: '#6b6b6b', fontSize: 14, marginBottom: 36 }}>Last updated: June 2, 2026</p>

      <p style={{ marginBottom: 20 }}>
        Mikalyzed Management (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is an internal customer-relationship and operations
        system used by Mikalyzed Auto Boutique to manage vehicle reconditioning, sales conversations, and
        customer relationships. This Privacy Policy explains how we collect, use, store, and protect
        information when you interact with us through this platform.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>1. Information We Collect</h2>
      <p style={{ marginBottom: 12 }}>We collect the following categories of information:</p>
      <ul style={{ paddingLeft: 24, marginBottom: 20 }}>
        <li><strong>Contact information</strong> &mdash; name, phone number, email address, mailing address, and Instagram handle provided by you or by Mikalyzed staff.</li>
        <li><strong>Communications</strong> &mdash; the content of SMS messages, emails, Instagram direct messages, and recorded phone calls exchanged with our staff.</li>
        <li><strong>Vehicle interest data</strong> &mdash; details of vehicles you have inquired about, test driven, or purchased.</li>
        <li><strong>Account &amp; authentication data</strong> &mdash; for staff users only: name, email, role, and login session identifiers.</li>
        <li><strong>Automatically collected</strong> &mdash; basic technical data such as IP address, browser type, and access timestamps for security auditing.</li>
      </ul>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>2. How We Use Information</h2>
      <ul style={{ paddingLeft: 24, marginBottom: 20 }}>
        <li>To respond to your inquiries about vehicles, services, or appointments.</li>
        <li>To track the status of vehicles in our reconditioning and sales pipeline.</li>
        <li>To send transactional and follow-up communications (SMS, email, Instagram DM) related to your inquiry.</li>
        <li>To improve internal sales and service operations.</li>
        <li>To comply with applicable laws, regulations, and lawful requests by authorities.</li>
      </ul>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>3. Information from Meta Platforms (Instagram)</h2>
      <p style={{ marginBottom: 20 }}>
        When you send a direct message to our Instagram business account (@mikalyzed_autoboutique),
        Meta delivers that message and your public profile information (Instagram-scoped user ID, username,
        display name) to our application via a webhook. We store this data securely and use it solely to
        respond to your inquiry. We do not share Meta-derived data with any third party, and we do not
        use it for advertising. You may revoke our access at any time by removing our application from
        your Instagram account&rsquo;s &ldquo;Apps and websites&rdquo; settings.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>4. How We Share Information</h2>
      <p style={{ marginBottom: 12 }}>
        We do not sell personal information. We share information only with the following categories of
        service providers that process data on our behalf and are contractually required to safeguard it:
      </p>
      <ul style={{ paddingLeft: 24, marginBottom: 20 }}>
        <li><strong>Cloud hosting:</strong> Vercel (application hosting), Neon / Postgres (database).</li>
        <li><strong>Messaging providers:</strong> Twilio (SMS &amp; voice), Microsoft Outlook / Graph API (email), Meta Platforms (Instagram messaging).</li>
        <li><strong>Email delivery:</strong> Resend.</li>
        <li><strong>Media storage:</strong> Cloudflare R2, Cloudinary.</li>
      </ul>
      <p style={{ marginBottom: 20 }}>
        We may also disclose information when required by law (subpoena, court order, regulatory request).
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>5. Data Retention &amp; Deletion</h2>
      <p style={{ marginBottom: 20 }}>
        We retain contact and conversation data for as long as needed to provide our services and to
        comply with legal obligations. You may request deletion of your data at any time by emailing
        <a href="mailto:it@mikalyzed.com" style={{ color: '#2563eb', textDecoration: 'none' }}> it@mikalyzed.com</a>.
        Upon verified request, we will delete your personal information within 30 days unless retention is
        required by law (e.g. completed sale transaction records).
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>6. Your Rights</h2>
      <p style={{ marginBottom: 20 }}>
        Depending on your jurisdiction (including residents of California, Virginia, Colorado, Connecticut,
        Utah, and the European Economic Area), you may have the right to access, correct, port, or delete
        the personal information we hold about you, and to opt out of certain processing activities.
        To exercise these rights, contact
        <a href="mailto:it@mikalyzed.com" style={{ color: '#2563eb', textDecoration: 'none' }}> it@mikalyzed.com</a>.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>7. Security</h2>
      <p style={{ marginBottom: 20 }}>
        We protect information with industry-standard measures including TLS-encrypted transport, encrypted
        database storage, signed-cookie session tokens, and role-based access controls limiting which staff
        members can view sensitive records. No security system is perfect; we cannot guarantee absolute
        security against unauthorized access.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>8. Children</h2>
      <p style={{ marginBottom: 20 }}>
        Our services are intended for adults 18 years of age or older. We do not knowingly collect
        information from children under 13. If you believe we have collected such information, contact us
        and we will delete it.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>9. Changes to This Policy</h2>
      <p style={{ marginBottom: 20 }}>
        We may update this Privacy Policy from time to time. We will post the revised version on this page
        and update the &ldquo;Last updated&rdquo; date above. Material changes will be communicated to
        active users by email.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>10. Contact</h2>
      <p style={{ marginBottom: 40 }}>
        Questions about this policy or your data:
        <br />
        <strong>Mikalyzed Auto Boutique</strong>
        <br />
        Email: <a href="mailto:it@mikalyzed.com" style={{ color: '#2563eb', textDecoration: 'none' }}>it@mikalyzed.com</a>
        <br />
        Miami, Florida, United States
      </p>

      <p style={{ fontSize: 13, color: '#9a9a9a', borderTop: '1px solid #e8e8e4', paddingTop: 20 }}>
        <a href="/terms" style={{ color: '#6b6b6b', marginRight: 16 }}>Terms of Service</a>
        <a href="/login" style={{ color: '#6b6b6b' }}>Back to app</a>
      </p>
    </div>
  )
}
