'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  SectionCard, SectionCardLabel, FieldStack, FieldRow, FieldBackplate,
  PremiumField, PremiumFieldSelect, PremiumFieldDate, SalesRepPicker,
  CollapsibleSectionToggle, CollapsibleStubInline, InterestedVehiclePicker,
  PremiumPillButton, formatPhone,
  GENDER_OPTIONS, ID_TYPE_OPTIONS, LEAD_TYPE_OPTIONS, LEAD_SOURCE_OPTIONS,
  CUSTOMER_STATUS_OPTIONS,
} from '@/components/customer-form-ui'

// ─── Add Customer Modal ─────────────────────────────────────────────
// Mirrors the DealerCenter "Add New Customer" surface: Buyer Info as the
// primary section, with collapsible Employment + Referrer sub-sections, and
// stub buttons for Interested Vehicle / Customer Wishlist / Campaign which
// tie into the future sales-pipeline + campaigns work.
export function AddCustomerModal({
  initialFirstName, initialLastName, onClose, onSaved,
}: {
  initialFirstName: string
  initialLastName: string
  onClose: () => void
  onSaved: (contact: { id: string; firstName: string; lastName: string }) => void
}) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Buyer Info
  const [firstName, setFirstName] = useState(initialFirstName)
  const [lastName, setLastName] = useState(initialLastName)
  const [gender, setGender] = useState('')
  const [ssn, setSsn] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [idType, setIdType] = useState('')
  const [idState, setIdState] = useState('')
  const [idNo, setIdNo] = useState('')
  const [idIssuedDate, setIdIssuedDate] = useState('')
  const [idExpirationDate, setIdExpirationDate] = useState('')
  const [phone, setPhone] = useState('')
  const [homePhone, setHomePhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  // Lead pipeline fields
  const [leadType, setLeadType] = useState('')
  const [customerStatus, setCustomerStatus] = useState('')
  const [leadSource, setLeadSource] = useState('')
  const [salesRepId, setSalesRepId] = useState<string | null>(null)
  const [salesRepLabel, setSalesRepLabel] = useState('')
  // Interested Vehicle — picked from existing inventory. On save the API
  // creates a VehicleInterest row linking this contact to the vehicle.
  const [interestedVehicleId, setInterestedVehicleId] = useState<string | null>(null)
  const [interestedVehicleLabel, setInterestedVehicleLabel] = useState('')

  // Collapsible sections
  const [showInterestedVehicle, setShowInterestedVehicle] = useState(false)
  const [showEmployment, setShowEmployment] = useState(false)
  const [showReferrer, setShowReferrer] = useState(false)
  // Employment
  const [employerName, setEmployerName] = useState('')
  const [employerPhone, setEmployerPhone] = useState('')
  const [employerAddress, setEmployerAddress] = useState('')
  const [employerYears, setEmployerYears] = useState('')
  const [employerMonthlyIncome, setEmployerMonthlyIncome] = useState('')
  // Referrer
  const [referrerName, setReferrerName] = useState('')

  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setErr(null)
    if (!firstName.trim() || !lastName.trim()) {
      setErr('First and Last Name are required')
      return
    }
    setSaving(true)
    try {
      const r = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          contactType: 'customer',
          gender, ssn, dateOfBirth: dateOfBirth || null,
          idType, idState, idNo,
          idIssuedDate: idIssuedDate || null,
          idExpirationDate: idExpirationDate || null,
          phone, homePhone, email,
          address,
          leadType, customerStatus, leadSource, salesRepId,
          employerName, employerPhone, employerAddress,
          employerYears, employerMonthlyIncome,
          referrerName,
          interestedVehicleId,
        }),
      })
      if (!r.ok) {
        const txt = await r.text()
        setErr(`Save failed (${r.status}): ${txt.slice(0, 160)}`)
        setSaving(false)
        return
      }
      const data = await r.json()
      if (!data?.id) {
        setErr('Save returned no contact id')
        setSaving(false)
        return
      }
      onSaved({ id: data.id, firstName: data.firstName, lastName: data.lastName })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  // Render via portal at document.body — same reason as AddPartnerModal.
  // Escapes any transformed ancestor (e.g. the Purchase Info GlassCard).
  return createPortal((
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 110,
        background: 'rgba(15, 23, 42, 0.32)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          // Same mesh-gradient backdrop as AddPartnerModal for visual consistency.
          background: [
            'radial-gradient(at 18% 24%, hsla(220, 90%, 72%, 0.22) 0px, transparent 55%)',
            'radial-gradient(at 82% 8%, hsla(280, 80%, 68%, 0.20) 0px, transparent 55%)',
            'radial-gradient(at 72% 76%, hsla(190, 70%, 78%, 0.16) 0px, transparent 50%)',
            'radial-gradient(at 4% 96%, hsla(340, 75%, 72%, 0.18) 0px, transparent 55%)',
            'radial-gradient(at 50% 50%, hsla(40, 80%, 80%, 0.10) 0px, transparent 50%)',
            'rgba(248, 248, 246, 0.85)',
          ].join(', '),
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          borderRadius: 22,
          border: '1px solid rgba(255, 255, 255, 0.7)',
          width: 'min(92vw, 1240px)',
          maxHeight: 'calc(100vh - 40px)',
          display: 'flex', flexDirection: 'column',
          boxShadow: [
            '0 30px 80px -20px rgba(15, 23, 42, 0.45)',
            '0 12px 32px -10px rgba(15, 23, 42, 0.18)',
            'inset 0 1px 0 rgba(255, 255, 255, 0.9)',
            'inset 0 0 0 0.5px rgba(255, 255, 255, 0.5)',
          ].join(', '),
          transform: 'translateZ(0)', contain: 'layout style',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 28px 18px',
        }}>
          <h2 style={{
            fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em',
            color: '#0a0a0a', lineHeight: 1, margin: 0,
          }}>Add New Customer</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.55)',
              border: '1px solid rgba(255, 255, 255, 0.6)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 1px 2px rgba(15, 23, 42, 0.06)',
              fontSize: 18, cursor: 'pointer', color: 'rgba(0,0,0,0.55)',
              minHeight: 'auto', padding: 0, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '0 24px 20px',
          overscrollBehavior: 'contain',
        }}>
          {/* Top row — 3 SectionCards side-by-side (Personal / ID / Contact) */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            gap: 16, alignItems: 'start',
          }}>
            {/* Personal Info */}
            <SectionCard>
              <SectionCardLabel>Personal Info</SectionCardLabel>
              <FieldStack>
                <FieldBackplate>
                  <PremiumField label="First Name" value={firstName} onChange={setFirstName} required />
                </FieldBackplate>
                <FieldBackplate>
                  <PremiumField label="Last Name" value={lastName} onChange={setLastName} required />
                </FieldBackplate>
                <FieldRow cols={[1, 1]}>
                  <FieldBackplate>
                    <PremiumFieldSelect label="Gender" value={gender} onChange={setGender} options={GENDER_OPTIONS} />
                  </FieldBackplate>
                  <FieldBackplate>
                    {/* SSN locked to exactly 9 digits — strip any non-digit
                        the user pastes/types and cap at 9.  Same rule any
                        future SSN input should follow. */}
                    <PremiumField label="SSN" value={ssn} onChange={(v) => setSsn(v.replace(/\D/g, '').slice(0, 9))} placeholder="123456789" />
                  </FieldBackplate>
                </FieldRow>
                <FieldBackplate>
                  <PremiumFieldDate label="Date of Birth" value={dateOfBirth} onChange={setDateOfBirth} />
                </FieldBackplate>
              </FieldStack>
            </SectionCard>

            {/* ID Info */}
            <SectionCard>
              <SectionCardLabel>ID Info</SectionCardLabel>
              <FieldStack>
                <FieldBackplate>
                  <PremiumFieldSelect label="ID Type" value={idType} onChange={setIdType} options={ID_TYPE_OPTIONS} />
                </FieldBackplate>
                <FieldBackplate>
                  <PremiumField label="ID State" value={idState} onChange={setIdState} placeholder="FL" />
                </FieldBackplate>
                <FieldBackplate>
                  <PremiumField label="ID No." value={idNo} onChange={setIdNo} />
                </FieldBackplate>
                <FieldRow cols={[1, 1]}>
                  <FieldBackplate>
                    <PremiumFieldDate label="Issued Date" value={idIssuedDate} onChange={setIdIssuedDate} />
                  </FieldBackplate>
                  <FieldBackplate>
                    <PremiumFieldDate label="Expiration Date" value={idExpirationDate} onChange={setIdExpirationDate} />
                  </FieldBackplate>
                </FieldRow>
              </FieldStack>
            </SectionCard>

            {/* Contact */}
            <SectionCard>
              <SectionCardLabel>Contact</SectionCardLabel>
              <FieldStack>
                <FieldBackplate>
                  <PremiumField label="Cell Phone" value={phone} onChange={(v) => setPhone(formatPhone(v))} />
                </FieldBackplate>
                <FieldBackplate>
                  <PremiumField label="Home Phone" value={homePhone} onChange={(v) => setHomePhone(formatPhone(v))} />
                </FieldBackplate>
                <FieldBackplate>
                  <PremiumField label="Email" value={email} onChange={setEmail} placeholder="name@example.com" />
                </FieldBackplate>
                <FieldBackplate>
                  <PremiumField label="Address" value={address} onChange={setAddress} placeholder="Street, City, State, ZIP" />
                </FieldBackplate>
              </FieldStack>
            </SectionCard>
          </div>

          {/* Lead Info — sales pipeline metadata + Sales Rep assignment */}
          <SectionCard>
            <SectionCardLabel>Lead Info</SectionCardLabel>
            <FieldStack>
              <FieldRow cols={[1, 1, 1]}>
                <FieldBackplate>
                  <PremiumFieldSelect label="Lead Type" value={leadType} onChange={setLeadType} options={LEAD_TYPE_OPTIONS} />
                </FieldBackplate>
                <FieldBackplate>
                  <PremiumFieldSelect label="Customer Status" value={customerStatus} onChange={setCustomerStatus} options={CUSTOMER_STATUS_OPTIONS} />
                </FieldBackplate>
                <FieldBackplate>
                  <PremiumFieldSelect label="Lead Source" value={leadSource} onChange={setLeadSource} options={LEAD_SOURCE_OPTIONS} />
                </FieldBackplate>
              </FieldRow>
              <SalesRepPicker
                value={salesRepId}
                label={salesRepLabel}
                onPick={(id, lbl) => { setSalesRepId(id); setSalesRepLabel(lbl) }}
                onClear={() => { setSalesRepId(null); setSalesRepLabel('') }}
              />
            </FieldStack>
          </SectionCard>

          {/* Five collapsible action buttons in a single row. Interested
              Vehicle is first (next to Employment per spec); when one is
              toggled open, its content expands below the row (full width). */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 8, marginBottom: 14, marginTop: 14,
          }}>
            <CollapsibleSectionToggle
              label={interestedVehicleId ? '✓ Interested Vehicle' : '+ Interested Vehicle'}
              open={showInterestedVehicle}
              onToggle={() => setShowInterestedVehicle(s => !s)}
            />
            <CollapsibleStubInline label="+ Employment" />
            <CollapsibleStubInline label="+ Referrer" />
            <CollapsibleStubInline label="+ Customer Wishlist" />
            <CollapsibleStubInline label="+ Associate with a Campaign" />
          </div>

          {showInterestedVehicle && (
            <SectionCard>
              <SectionCardLabel>Interested Vehicle</SectionCardLabel>
              <InterestedVehiclePicker
                vehicleId={interestedVehicleId}
                label={interestedVehicleLabel}
                onPick={(id, lbl) => {
                  setInterestedVehicleId(id)
                  setInterestedVehicleLabel(lbl)
                }}
                onClear={() => {
                  setInterestedVehicleId(null)
                  setInterestedVehicleLabel('')
                }}
              />
            </SectionCard>
          )}

          {showEmployment && (
            <SectionCard>
              <SectionCardLabel>Employment</SectionCardLabel>
              <FieldStack>
                <FieldRow cols={[1, 1]}>
                  <FieldBackplate>
                    <PremiumField label="Employer Name" value={employerName} onChange={setEmployerName} />
                  </FieldBackplate>
                  <FieldBackplate>
                    <PremiumField label="Employer Phone" value={employerPhone} onChange={(v) => setEmployerPhone(formatPhone(v))} />
                  </FieldBackplate>
                </FieldRow>
                <FieldBackplate>
                  <PremiumField label="Employer Address" value={employerAddress} onChange={setEmployerAddress} placeholder="Street, City, State, ZIP" />
                </FieldBackplate>
                <FieldRow cols={[1, 1]}>
                  <FieldBackplate>
                    <PremiumField label="Years at Employer" value={employerYears} onChange={setEmployerYears} placeholder="0" />
                  </FieldBackplate>
                  <FieldBackplate>
                    <PremiumField label="Monthly Income" value={employerMonthlyIncome} onChange={setEmployerMonthlyIncome} placeholder="$0.00" />
                  </FieldBackplate>
                </FieldRow>
              </FieldStack>
            </SectionCard>
          )}

          {showReferrer && (
            <SectionCard>
              <SectionCardLabel>Referrer</SectionCardLabel>
              <FieldBackplate>
                <PremiumField label="Referrer Name" value={referrerName} onChange={setReferrerName} placeholder="Who referred this customer" />
              </FieldBackplate>
            </SectionCard>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 28px 18px', gap: 12,
          background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.55) 100%)',
        }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: err ? '#dc2626' : 'rgba(0,0,0,0.5)', letterSpacing: '-0.005em' }}>
            {err ?? 'First and last name required'}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              onClick={onClose}
              disabled={saving}
              style={{
                background: 'none', border: 'none',
                padding: '8px 4px', fontSize: 13, fontWeight: 600,
                color: 'rgba(0,0,0,0.55)', cursor: 'pointer', minHeight: 'auto',
                letterSpacing: '-0.005em',
                opacity: saving ? 0.5 : 1,
              }}
            >Cancel</button>
            <PremiumPillButton
              label={saving ? 'Saving…' : 'Save Customer'}
              onClick={save}
              disabled={saving || !firstName.trim() || !lastName.trim()}
            />
          </div>
        </div>
      </div>
    </div>
  ), document.body)
}
