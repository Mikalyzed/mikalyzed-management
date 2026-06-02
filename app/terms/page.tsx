import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service — Mikalyzed Management',
  description: 'Terms of Service for the Mikalyzed Management CRM application.',
}

export default function TermsPage() {
  return (
    <div style={{
      maxWidth: 760, margin: '0 auto', padding: '60px 24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Helvetica Neue", sans-serif',
      color: '#1a1a1a', lineHeight: 1.6,
    }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8 }}>Terms of Service</h1>
      <p style={{ color: '#6b6b6b', fontSize: 14, marginBottom: 36 }}>Last updated: June 2, 2026</p>

      <p style={{ marginBottom: 20 }}>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the Mikalyzed
        Management platform (the &ldquo;Service&rdquo;), operated by Mikalyzed Auto Boutique
        (&ldquo;Mikalyzed&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By accessing or using the Service,
        you agree to be bound by these Terms.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>1. The Service</h2>
      <p style={{ marginBottom: 20 }}>
        Mikalyzed Management is an internal customer-relationship and operations platform used to manage
        vehicle reconditioning, sales conversations, scheduling, and customer communications for Mikalyzed
        Auto Boutique. Some features (such as Instagram direct messaging) interact with third-party
        platforms whose own terms also apply.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>2. Who May Use the Service</h2>
      <p style={{ marginBottom: 20 }}>
        Access to the internal management interface is limited to authorized employees and contractors of
        Mikalyzed Auto Boutique. Public-facing portions of the Service (e.g. customer document upload
        pages, communications you initiate by contacting Mikalyzed) may be used by individuals who are at
        least 18 years of age.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>3. Account Security</h2>
      <p style={{ marginBottom: 20 }}>
        If you are a staff user with login credentials, you are responsible for maintaining the
        confidentiality of your password and for all activities that occur under your account. Notify us
        immediately at <a href="mailto:it@mikalyzed.com" style={{ color: '#2563eb', textDecoration: 'none' }}>it@mikalyzed.com</a> of any unauthorized use.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>4. Acceptable Use</h2>
      <p style={{ marginBottom: 12 }}>You agree not to:</p>
      <ul style={{ paddingLeft: 24, marginBottom: 20 }}>
        <li>Use the Service to send unsolicited commercial communications (spam) or to harass any individual.</li>
        <li>Attempt to gain unauthorized access to the Service, other users&rsquo; accounts, or our infrastructure.</li>
        <li>Reverse engineer, decompile, or otherwise extract source code or proprietary data from the Service.</li>
        <li>Use the Service in violation of any applicable law or regulation.</li>
        <li>Misrepresent your identity or affiliation when communicating through the Service.</li>
      </ul>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>5. Communications with Customers</h2>
      <p style={{ marginBottom: 20 }}>
        When using the Service to send messages via SMS, email, or Instagram, you agree to comply with all
        applicable laws including the TCPA, CAN-SPAM Act, and Meta Platform Terms. You will not send
        marketing content to customers who have opted out, and you will honor unsubscribe requests
        promptly.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>6. Third-Party Services</h2>
      <p style={{ marginBottom: 20 }}>
        The Service integrates with third-party providers including Twilio, Microsoft (Outlook / Graph
        API), Meta Platforms (Instagram), Resend, Cloudinary, Cloudflare R2, and Vercel. Your use of those
        integrations is subject to their respective terms. Mikalyzed is not responsible for outages,
        errors, or content originating from those providers.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>7. Intellectual Property</h2>
      <p style={{ marginBottom: 20 }}>
        The Service and all software, designs, and content created by Mikalyzed are the property of
        Mikalyzed Auto Boutique. You may not copy, modify, distribute, or create derivative works without
        prior written permission.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>8. Disclaimer of Warranties</h2>
      <p style={{ marginBottom: 20 }}>
        The Service is provided &ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE&rdquo; without warranties of
        any kind, whether express or implied, including but not limited to merchantability, fitness for a
        particular purpose, and non-infringement. We do not guarantee that the Service will be
        uninterrupted, error-free, or completely secure.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>9. Limitation of Liability</h2>
      <p style={{ marginBottom: 20 }}>
        To the maximum extent permitted by law, Mikalyzed Auto Boutique shall not be liable for any
        indirect, incidental, consequential, special, or exemplary damages arising out of or relating to
        your use of the Service. Our total liability for any claim arising under these Terms is limited to
        $100 USD or the amount you paid us in the preceding 12 months, whichever is greater.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>10. Termination</h2>
      <p style={{ marginBottom: 20 }}>
        We may suspend or terminate your access to the Service at any time, with or without notice, for
        any reason including violation of these Terms. You may stop using the Service at any time.
        Sections that by their nature should survive termination (intellectual property, disclaimers,
        limitation of liability, governing law) will continue to apply.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>11. Governing Law</h2>
      <p style={{ marginBottom: 20 }}>
        These Terms are governed by the laws of the State of Florida, United States, without regard to
        conflict of law principles. Any dispute arising out of these Terms or the Service shall be
        resolved exclusively in the state or federal courts located in Miami-Dade County, Florida, and you
        consent to the jurisdiction of those courts.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>12. Changes to These Terms</h2>
      <p style={{ marginBottom: 20 }}>
        We may modify these Terms from time to time. Material changes will be posted on this page with an
        updated &ldquo;Last updated&rdquo; date. Continued use of the Service after changes become
        effective constitutes acceptance of the revised Terms.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 12 }}>13. Contact</h2>
      <p style={{ marginBottom: 40 }}>
        Questions about these Terms:
        <br />
        <strong>Mikalyzed Auto Boutique</strong>
        <br />
        Email: <a href="mailto:it@mikalyzed.com" style={{ color: '#2563eb', textDecoration: 'none' }}>it@mikalyzed.com</a>
        <br />
        Miami, Florida, United States
      </p>

      <p style={{ fontSize: 13, color: '#9a9a9a', borderTop: '1px solid #e8e8e4', paddingTop: 20 }}>
        <a href="/privacy" style={{ color: '#6b6b6b', marginRight: 16 }}>Privacy Policy</a>
        <a href="/login" style={{ color: '#6b6b6b' }}>Back to app</a>
      </p>
    </div>
  )
}
