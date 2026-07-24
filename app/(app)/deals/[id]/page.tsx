'use client'

// ─── Deal worksheet (Deal Desk Slice 1.5) ─────────────────────────────
// DealerCenter-grade deal screen in the recon-board design language:
//  • Deal calculator with dynamic line-item rows (⋮ opens the itemizer)
//  • Up to 4 trade-ins, each reducing the FL taxable base (trade difference)
//  • Changeable vehicle while the deal is a draft
//  • Live totals via the same computeDealTotals the server stores
// Money-facing: admin + sales_manager only (API-enforced).

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  computeDealTotals, flCountySurtaxRate, formatDealNumber,
  CATEGORY_TAXABLE_DEFAULT, LINE_ITEM_CATEGORIES, LINE_ITEM_PRESETS, MAX_TRADES,
  type DealTotals,
} from '@/lib/deals'

// ─── Types ────────────────────────────────────────────────────────────

type LineItem = {
  id?: string; category: string; label: string; amount: number; taxable: boolean
  cost?: number | null; itemNumber?: string | null
  vendorPartnerId?: string | null; deductFrom?: string | null
  vendorPartner?: { id: string; companyName: string } | null
}
type Trade = {
  id?: string
  vin: string | null; year: number | null; make: string | null; model: string | null
  trim: string | null; mileage: number | null; color: string | null
  allowance: number; acv: number; payoff: number
  lienholder: string | null; notes: string | null
}

// Full applicant record — the deal jacket edits the buyer's Contact inline
// (DealerCenter-style), each field committing to /api/customers/:id on blur.
type Buyer = {
  id: string
  salutation: string | null; firstName: string; middleName: string | null
  lastName: string; nameSuffix: string | null; nickname: string | null
  gender: string | null; ssn: string | null; dateOfBirth: string | null
  idType: string | null; idState: string | null; idNo: string | null
  idIssuedDate: string | null; idExpirationDate: string | null
  phone: string | null; homePhone: string | null; workPhone: string | null; email: string | null
  address: string | null; city: string | null; state: string | null; zip: string | null; county: string | null
  residenceType: string | null; rentMortgage: number | null
  lengthAtAddressYears: number | null; lengthAtAddressMonths: number | null
  prevStreet: string | null; prevCity: string | null; prevState: string | null
  prevZip: string | null; prevCounty: string | null; prevResidenceType: string | null
  prevRentMortgage: number | null; prevLengthYears: number | null; prevLengthMonths: number | null
  employmentType: string | null; employerName: string | null; employerPhone: string | null
  employerAddress: string | null; employerYears: number | null; employerMonths: number | null
  incomeType: string | null; employerMonthlyIncome: number | null
  employment2Type: string | null; employer2Name: string | null; employer2Phone: string | null
  employer2Years: number | null; employer2Months: number | null
  income2Type: string | null; employer2MonthlyIncome: number | null
  coBuyerRelationship: string | null
}

// Wholesale business buyer — full Business record, edited inline like the
// applicant (commits to /api/businesses/:id).
type BusinessBuyer = {
  id: string
  businessName: string
  tradeName: string | null; enterpriseType: string | null; taxId: string | null
  yearsInBusiness: number | null; monthsInBusiness: number | null; grossMonthlyIncome: number | null
  street: string | null; city: string | null; state: string | null; zip: string | null; county: string | null
  lengthAtAddressYears: number | null; lengthAtAddressMonths: number | null
  mortgageType: string | null; phone: string | null; email: string | null; typeOfBusiness: string | null
  vehiclesFinanced: number | null; vehiclesOwned: number | null; aggregateMonthlyPmt: number | null
  loanLease: string | null; operatingLease: string | null
  priorBankruptcy: string | null; priorRepossession: string | null
  lawsuitParty: string | null; delinquentTaxes: string | null
  operatorFirstName: string | null; operatorLastName: string | null
  operatorStreet: string | null; operatorCity: string | null; operatorState: string | null
  operatorZip: string | null; operatorCounty: string | null
  principalFirstName: string | null; principalLastName: string | null
  principalJobTitle: string | null; principalPhone: string | null; principalDob: string | null
  principalOwnershipPct: number | null
  principalStreet: string | null; principalCity: string | null; principalState: string | null
  principalZip: string | null; principalCounty: string | null
}

type Deal = {
  id: string
  dealNumber: number
  status: string
  dealType: string
  salePrice: number
  collectTax: boolean
  stateTaxRate: number
  countySurtaxRate: number
  surtaxCap: number
  taxAmount: number
  depositCredit: number
  otdTotal: number
  notes: string | null
  fundedAt: string | null
  createdAt: string
  vehicle: {
    id: string; stockNumber: string; vin: string | null; year: number | null
    make: string | null; model: string | null; color: string | null
    mileage: number | null; askingPrice: number | null; inventoryStatus: string | null
    trim: string | null; engine: string | null; transmission: string | null
    driveTrain: string | null; titleBrand: string | null; newUsed: string | null
  }
  buyer: Buyer | null
  businessBuyer: BusinessBuyer | null
  coBuyer: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null } | null
  salesRep: { id: string; name: string } | null
  createdBy: { id: string; name: string } | null
  lineItems: LineItem[]
  trades: Trade[]
}

// ─── Applicant option lists (DealerCenter parity) ─────────────────────

const SALUTATIONS = ['Mr.', 'Mrs.', 'Ms.', 'Dr.']
const SUFFIXES = ['Jr.', 'Sr.', 'II', 'III', 'IV']
const GENDERS = ['Male', 'Female']
const ID_TYPES = ["US Driver's License", 'State ID', 'Passport', 'Other']
const RESIDENCE_TYPES = ['Own', 'Rent', 'Live with Family', 'Other']
const EMPLOYMENT_TYPES = ['Employed', 'Self-Employed', 'Retired', 'Military', 'Student', 'Unemployed', 'Other']
const INCOME_TYPES = ['Salary', 'Hourly', 'Commission', 'Self-Employed', 'Fixed Income', 'Other']
const RELATIONSHIPS = ['Spouse', 'Partner', 'Parent', 'Child', 'Sibling', 'Relative', 'Friend', 'Business Partner', 'Other']
const NEW_USED = ['Used', 'New']
const ENTERPRISE_TYPES = ['Corporation', 'LLC', 'Partnership', 'Proprietor', 'Other']
const MORTGAGE_TYPES = ['Own', 'Rent', 'Mortgage', 'Other']
const YES_NO = ['No', 'Yes']
const TRANSMISSIONS = ['Automatic', 'Manual', 'CVT', 'Dual-Clutch', 'Other']
const DRIVETRAINS = ['RWD', 'FWD', 'AWD', '4WD']
const TITLE_BRANDS = ['Clean', 'Salvage', 'Rebuilt', 'Flood', 'Lemon Law', 'Other']

// ─── Recon-board design tokens ────────────────────────────────────────

const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  borderRadius: 16,
  border: '1px solid var(--border)',
  boxShadow: '0 1px 2px rgba(24,24,27,.04), 0 6px 16px -6px rgba(24,24,27,.10)',
}

const eyebrow: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.07em', color: 'var(--text-muted)',
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
const money0 = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

// Small ghost chevron that folds a section back to its slim header row.
function CollapseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Hide section"
      style={{
        width: 28, height: 28, minHeight: 0, borderRadius: 8, border: 'none', padding: 0,
        background: 'var(--bg-primary)', color: 'var(--text-muted)', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        transition: 'background 0.12s ease, color 0.12s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--lane-bg)'; e.currentTarget.style.color = 'var(--text-primary)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-primary)'; e.currentTarget.style.color = 'var(--text-muted)' }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m18 15-6-6-6 6" />
      </svg>
    </button>
  )
}

function SectionHeader({ tile, tint, title, sub }: { tile: React.ReactNode; tint: string; title: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
      <span style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        background: tint, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>{tile}</span>
      <div>
        <div style={{ ...eyebrow }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function DealWorksheetPage() {
  const params = useParams()
  const router = useRouter()
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string)

  const [deal, setDeal] = useState<Deal | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Itemizer popover — anchored beside the clicked category box.
  const [itemizer, setItemizer] = useState<{ category: string; rect: { top: number; left: number; right: number } } | null>(null)
  const [vehiclePicker, setVehiclePicker] = useState(false)
  const [tradesHidden, setTradesHidden] = useState(false)
  // In-app confirm dialog (no native browser popups).
  const [confirmAction, setConfirmAction] = useState<null | {
    title: string; body: string; confirmLabel: string; onConfirm: () => void
  }>(null)

  // Optimistic trade mutations. All of them read/write through dealRef —
  // NOT the render closure — so two quick edits compose instead of the
  // second one resurrecting stale values (rapid Allowance→Payoff blurs
  // were silently reverting the first edit).
  const dealRef = useRef<Deal | null>(null)
  useEffect(() => { dealRef.current = deal }, [deal])

  const commitTrades = (mutate: (trades: Trade[]) => Trade[]) => {
    const cur = dealRef.current
    if (!cur) return
    const trades = mutate(cur.trades)
    const optimistic = { ...cur, trades }
    dealRef.current = optimistic
    setDeal(optimistic)
    patch({ trades })
  }
  const addTradeNow = () => {
    setTradesHidden(false)
    commitTrades(trades => [...trades, emptyTrade()])
  }
  const removeTradeNow = (index: number) => {
    commitTrades(trades => trades.filter((_, j) => j !== index))
  }
  const updateTradeNow = (index: number, next: Trade) => {
    commitTrades(trades => trades.map((x, j) => (j === index ? next : x)))
  }

  // Retail ↔ Wholesale switch. Wholesale uses a business buyer and defaults
  // to no tax (resale). Swapping detaches the other buyer type — confirmed
  // first so a stray click never silently drops a customer off a deal.
  const switchDealType = (key: 'retail_cash' | 'wholesale') => {
    if (!deal || key === deal.dealType) return
    if (key === 'wholesale') {
      const doIt = () => patch({ dealType: 'wholesale', collectTax: false, buyerContactId: null, coBuyerContactId: null })
      if (deal.buyer) {
        setConfirmAction({
          title: 'Switch to Wholesale Deal?',
          body: `${deal.buyer.firstName} ${deal.buyer.lastName} comes off the deal — wholesale deals use a business buyer instead. Their customer record is untouched.`,
          confirmLabel: 'Switch to Wholesale',
          onConfirm: doIt,
        })
      } else doIt()
    } else {
      const doIt = () => patch({ dealType: 'retail_cash', collectTax: true, businessBuyerId: null })
      if (deal.businessBuyer) {
        setConfirmAction({
          title: 'Switch to Retail Deal?',
          body: `${deal.businessBuyer.businessName} comes off the deal — retail deals use a customer as the buyer. The business stays in your list.`,
          confirmLabel: 'Switch to Retail',
          onConfirm: doIt,
        })
      } else doIt()
    }
  }

  const load = useCallback(async () => {
    const d = await fetch(`/api/deals/${id}`).then(r => r.json())
    setDeal(d.deal || null)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const patch = useCallback(async (fields: Record<string, unknown>) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/deals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Save failed'); return false }
      setDeal(d.deal)
      return true
    } catch {
      // Network failure with optimistic UI on screen — say so loudly and
      // resync from the server so the screen can't lie about what saved.
      setError('Connection problem — your last change may not have saved.')
      try {
        const fresh = await fetch(`/api/deals/${id}`).then(r => r.json())
        if (fresh.deal) setDeal(fresh.deal)
      } catch { /* still offline — the error banner stands */ }
      return false
    } finally {
      setSaving(false)
    }
  }, [id])

  // Applicant edits write to the BUYER's contact record (single source of
  // truth — same data the customer profile shows), then silently re-pull
  // the deal so the jacket reflects it.
  const patchBuyer = useCallback(async (fields: Record<string, unknown>) => {
    if (!deal?.buyer) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/customers/${deal.buyer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Save failed')
        return
      }
      const fresh = await fetch(`/api/deals/${id}`).then(r => r.json())
      if (fresh.deal) {
        setDeal(fresh.deal)
        // County drives the surtax: if the buyer's county just changed and
        // we recognize it, snap the deal's rate to that county's.
        if ('county' in fields && fresh.deal.status === 'draft' && fresh.deal.dealType !== 'wholesale') {
          const rate = flCountySurtaxRate(typeof fields.county === 'string' ? fields.county : null)
          if (rate != null && rate !== fresh.deal.countySurtaxRate) {
            await patch({ countySurtaxRate: rate })
          }
        }
      }
    } catch {
      setError('Connection problem — your last change may not have saved.')
    } finally {
      setSaving(false)
    }
  }, [deal, id, patch])

  // Attaching/detaching a co-buyer updates BOTH the deal snapshot and the
  // buyer's profile so the two surfaces stay in sync.
  // Wholesale business edits — same commit-on-blur, own endpoint.
  const patchBusiness = useCallback(async (fields: Record<string, unknown>) => {
    if (!deal?.businessBuyer) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/businesses/${deal.businessBuyer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Save failed')
        return
      }
      const fresh = await fetch(`/api/deals/${id}`).then(r => r.json())
      if (fresh.deal) setDeal(fresh.deal)
    } catch {
      setError('Connection problem — your last change may not have saved.')
    } finally {
      setSaving(false)
    }
  }, [deal, id])

  const setCoBuyer = useCallback(async (contactId: string | null) => {
    if (!deal?.buyer) return
    await patch({ coBuyerContactId: contactId })
    await fetch(`/api/customers/${deal.buyer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coBuyerContactId: contactId }),
    }).catch(() => {})
  }, [deal, patch])

  if (loading || !deal) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
  }

  const totals = computeDealTotals(deal)
  const editable = deal.status === 'draft'

  const catTotal = (key: string) =>
    deal.lineItems.filter(i => i.category === key).reduce((s, i) => s + (i.amount || 0), 0)

  return (
    // Single-column jacket reads best at form width, not full board width.
    <div style={{ maxWidth: 1080, margin: '0 auto' }}>
      {/* ── Header: just the deal type + status note ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Deal type — wholesale gets its own flow later (per DC screens). */}
          <div style={{ display: 'flex', gap: 3, padding: 4, background: 'var(--bg-primary)', borderRadius: 12 }}>
            {([['retail_cash', 'Retail Deal'], ['wholesale', 'Wholesale Deal']] as const).map(([key, lbl]) => {
              const active = deal.dealType === key
              return (
                <button
                  key={key}
                  disabled={!editable}
                  onClick={() => switchDealType(key)}
                  style={{
                    padding: '6px 14px', borderRadius: 9, border: 'none', minHeight: 0,
                    background: active ? 'var(--bg-card)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize: 12.5, fontWeight: 600, cursor: editable ? 'pointer' : 'default',
                    boxShadow: active ? '0 1px 3px rgba(24,24,27,0.10)' : 'none',
                    transition: 'background 0.15s ease',
                  }}
                >{lbl}</button>
              )
            })}
          </div>
          {deal.status === 'funded' && (
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#16a34a' }}>
              Funded {deal.fundedAt ? new Date(deal.fundedAt).toLocaleDateString() : ''}
            </span>
          )}
          {deal.status === 'cancelled' && (
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#e11d48' }}>Cancelled</span>
          )}
        </div>
        {saving && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Saving…</span>}
      </div>

      {error && (
        <div style={{
          ...card, position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(180deg, #fff5f5, var(--bg-card) 70%)',
          padding: '12px 18px 12px 21px', marginBottom: 16,
          fontSize: 13, fontWeight: 600, color: '#e11d48',
        }}>
          <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: '#ef4444' }} />
          {error}
        </div>
      )}

      {/* ════ Deal jacket — single column, DC section order ════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

          {deal.dealType === 'wholesale' ? (
            /* ── Business Info (wholesale buyer) ── */
            <BusinessCard
              business={deal.businessBuyer}
              editable={editable}
              onAttach={(bid) => patch({ businessBuyerId: bid })}
              onDetach={() => setConfirmAction({
                title: 'Detach this business?',
                body: `${deal.businessBuyer?.businessName ?? 'The business'} comes off the deal — it stays in your business list.`,
                confirmLabel: 'Detach',
                onConfirm: () => patch({ businessBuyerId: null }),
              })}
              onSave={patchBusiness}
            />
          ) : deal.buyer ? (
            <>
              {/* ── Applicant Info ── */}
              <ApplicantCard buyer={deal.buyer} editable={editable} onSave={patchBuyer} />

              {/* ── Employment ── */}
              <EmploymentCard buyer={deal.buyer} editable={editable} onSave={patchBuyer} />

              {/* ── Co-Buyer ── */}
              <CoBuyerSection
                coBuyer={deal.coBuyer}
                relationship={deal.buyer.coBuyerRelationship}
                editable={editable}
                onAttach={(cid) => setCoBuyer(cid)}
                onDetach={() => setCoBuyer(null)}
                onRelationship={(v) => patchBuyer({ coBuyerRelationship: v })}
              />
            </>
          ) : (
            /* Retail deal with no buyer (e.g. switched back from wholesale) */
            <AttachBuyerCard editable={editable} onAttach={(cid) => patch({ buyerContactId: cid })} />
          )}

          {/* ── Trade-ins ── */}
          <div style={{ ...card, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: deal.trades.length && !tradesHidden ? 14 : 0 }}>
              <SectionHeader
                tint="rgba(13,148,136,0.10)"
                tile={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5M8 21H3v-5M21 3l-7 7M3 21l7-7" /></svg>}
                title={`Trade-In${deal.trades.length ? ` (${deal.trades.length})` : ''}`}
                sub={tradesHidden && deal.trades.length
                  ? `${deal.trades.length} trade${deal.trades.length > 1 ? 's' : ''} — hidden`
                  : deal.trades.length ? 'FL tax is charged on the trade difference' : 'None — add up to 4 if the customer is trading'}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {tradesHidden && deal.trades.length > 0 ? (
                  <button
                    onClick={() => setTradesHidden(false)}
                    style={{
                      padding: '8px 14px', borderRadius: 100, minHeight: 0,
                      border: '1.5px dashed var(--border)', background: 'transparent',
                      fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer',
                      transition: 'border-color 0.12s ease, color 0.12s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#c4e050'; e.currentTarget.style.color = 'var(--text-primary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
                  >Show trades</button>
                ) : (
                  <>
                    {editable && deal.trades.length < MAX_TRADES && (
                      <button
                        onClick={addTradeNow}
                        style={{
                          padding: '8px 14px', borderRadius: 100, minHeight: 0,
                          border: '1.5px dashed var(--border)', background: 'transparent',
                          fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer',
                          transition: 'border-color 0.12s ease, color 0.12s ease',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#c4e050'; e.currentTarget.style.color = 'var(--text-primary)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
                      >+ Add Trade</button>
                    )}
                    {deal.trades.length > 0 && <CollapseBtn onClick={() => setTradesHidden(true)} />}
                  </>
                )}
              </div>
            </div>

            {deal.trades.length > 0 && !tradesHidden && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {deal.trades.map((t, i) => (
                  <TradeCard
                    key={t.id ?? i}
                    index={i}
                    trade={t}
                    editable={editable}
                    onChange={(next) => updateTradeNow(i, next)}
                    onRemove={() => setConfirmAction({
                      title: `Remove Trade ${i + 1}?`,
                      body: `${[t.year, t.make, t.model].filter(Boolean).join(' ') || 'This trade-in'} comes off the deal — its allowance and payoff leave the totals.`,
                      confirmLabel: 'Remove Trade',
                      onConfirm: () => removeTradeNow(i),
                    })}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Vehicle ── */}
          <div style={{ ...card, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <SectionHeader
                tint="rgba(59,130,246,0.10)"
                tile={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /><path d="M9 17h6" /></svg>}
                title="Vehicle"
                sub={`Stock #${deal.vehicle.stockNumber}${deal.vehicle.vin ? ` · ${deal.vehicle.vin}` : ''}`}
              />
              {editable && (
                <button onClick={() => setVehiclePicker(true)} style={{
                  padding: '7px 14px', borderRadius: 100, minHeight: 0,
                  border: '1px solid var(--border)', background: '#fff',
                  fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)',
                }}>Change Vehicle</button>
              )}
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              marginTop: 14, flexWrap: 'wrap',
            }}>
              <div style={{ minWidth: 0 }}>
                <Link href={`/vehicles/${deal.vehicle.id}`} style={{ textDecoration: 'none', minHeight: 0, display: 'inline-block' }}>
                  <span style={{ fontSize: 16, fontWeight: 640, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>
                    {[deal.vehicle.year, deal.vehicle.make, deal.vehicle.model].filter(Boolean).join(' ')}
                  </span>
                </Link>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 3 }}>
                  {[
                    deal.vehicle.mileage != null ? `${deal.vehicle.mileage.toLocaleString()} mi` : null,
                    deal.vehicle.color,
                  ].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              {deal.vehicle.askingPrice != null && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ ...eyebrow, fontSize: 10 }}>Asking</div>
                  <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                    {money0(deal.vehicle.askingPrice)}
                  </div>
                </div>
              )}
            </div>

            {/* Editable specs — DC Vehicle Info parity; writes to the
                Vehicle record so inventory stays the single source of truth. */}
            <div style={{ height: 1, background: 'var(--border-light)', margin: '14px 0' }} />
            {/* Three balanced rows of four — roomy, aligned columns. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '12px 12px' }}>
              <div style={{ gridColumn: 'span 4', minWidth: 0 }}>
                <JField label="VIN" required value={deal.vehicle.vin} onSave={(v) => patch({ vehiclePatch: { vin: v } })} editable={editable} flex="1 1 auto" />
              </div>
              <div style={{ gridColumn: 'span 3', minWidth: 0 }}>
                <JField label="Stock No." value={deal.vehicle.stockNumber} onSave={(v) => v && patch({ vehiclePatch: { stockNumber: v } })} editable={editable} flex="1 1 auto" />
              </div>
              <div style={{ gridColumn: 'span 3', minWidth: 0 }}>
                <JSelect label="New / Used" value={deal.vehicle.newUsed} options={NEW_USED} onSave={(v) => patch({ vehiclePatch: { newUsed: v } })} editable={editable} flex="1 1 auto" />
              </div>
              <div style={{ gridColumn: 'span 2', minWidth: 0 }}>
                <JField label="Year" required value={deal.vehicle.year} onSave={(v) => patch({ vehiclePatch: { year: v } })} editable={editable} kind="int" flex="1 1 auto" />
              </div>

              <div style={{ gridColumn: 'span 4', minWidth: 0 }}>
                <JField label="Make" required value={deal.vehicle.make} onSave={(v) => v && patch({ vehiclePatch: { make: v } })} editable={editable} flex="1 1 auto" />
              </div>
              <div style={{ gridColumn: 'span 3', minWidth: 0 }}>
                <JField label="Model" required value={deal.vehicle.model} onSave={(v) => v && patch({ vehiclePatch: { model: v } })} editable={editable} flex="1 1 auto" />
              </div>
              <div style={{ gridColumn: 'span 3', minWidth: 0 }}>
                <JField label="Trim" required value={deal.vehicle.trim} onSave={(v) => patch({ vehiclePatch: { trim: v } })} editable={editable} flex="1 1 auto" />
              </div>
              <div style={{ gridColumn: 'span 2', minWidth: 0 }}>
                <JField label="Mileage" required value={deal.vehicle.mileage} onSave={(v) => patch({ vehiclePatch: { mileage: v } })} editable={editable} kind="int" flex="1 1 auto" />
              </div>

              <div style={{ gridColumn: 'span 4', minWidth: 0 }}>
                <JField label="Engine" value={deal.vehicle.engine} onSave={(v) => patch({ vehiclePatch: { engine: v } })} editable={editable} flex="1 1 auto" />
              </div>
              <div style={{ gridColumn: 'span 3', minWidth: 0 }}>
                <JSelect label="Transmission" value={deal.vehicle.transmission} options={TRANSMISSIONS} onSave={(v) => patch({ vehiclePatch: { transmission: v } })} editable={editable} flex="1 1 auto" />
              </div>
              <div style={{ gridColumn: 'span 3', minWidth: 0 }}>
                <JSelect label="Drive Train" value={deal.vehicle.driveTrain} options={DRIVETRAINS} onSave={(v) => patch({ vehiclePatch: { driveTrain: v } })} editable={editable} flex="1 1 auto" />
              </div>
              <div style={{ gridColumn: 'span 2', minWidth: 0 }}>
                <JSelect label="Title Brand" value={deal.vehicle.titleBrand} options={TITLE_BRANDS} onSave={(v) => patch({ vehiclePatch: { titleBrand: v } })} editable={editable} flex="1 1 auto" />
              </div>
            </div>
          </div>

          {/* ── Deal calculator (half) + live snapshot (half) — equal height ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, alignItems: 'stretch' }}>
          <div style={{ ...card, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <SectionHeader
                tint="rgba(99,102,241,0.10)"
                tile={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8M8 10h8M8 14h4" /></svg>}
                title="Deal Info"
                sub="Out-the-door worksheet"
              />
              {/* Wholesale never collects tax — no toggle to fiddle with.
                  Optimistic: the pill flips + totals recompute instantly;
                  the PATCH reconciles behind it. */}
              {deal.dealType !== 'wholesale' && (
                <TaxToggle
                  collect={deal.collectTax}
                  disabled={!editable}
                  onChange={(v) => {
                    setDeal({ ...deal, collectTax: v })
                    patch({ collectTax: v })
                  }}
                />
              )}
            </div>

            {/* Price */}
            <CalcRow
              sign="+"
              label="Price"
              amount={deal.salePrice}
              editable={editable}
              onSave={(v) => patch({ salePrice: v })}
              strong
            />

            {/* Dynamic category rows — the "⋮" itemizer boxes */}
            {LINE_ITEM_CATEGORIES.map(cat => (
              <CalcRow
                key={cat.key}
                sign="+"
                label={cat.label}
                amount={catTotal(cat.key)}
                editable={editable}
                itemized
                itemCount={deal.lineItems.filter(i => i.category === cat.key).length}
                onOpen={(r) => setItemizer({ category: cat.key, rect: { top: r.top, left: r.left, right: r.right } })}
              />
            ))}

            {/* Tax */}
            <CalcRow
              sign="+"
              label={deal.dealType === 'wholesale'
                ? 'Total Tax (wholesale)'
                : deal.collectTax
                  ? `Total Tax (${((deal.stateTaxRate + deal.countySurtaxRate) * 100).toFixed(1)}% FL)`
                  : 'Total Tax (out-of-state)'}
              amount={totals.taxAmount}
              locked
              lockedHint={deal.dealType === 'wholesale'
                ? 'No sales tax on wholesale / dealer-to-dealer deals (resale)'
                : deal.collectTax
                  ? `${(deal.stateTaxRate * 100).toFixed(1)}% state on ${money0(totals.taxableBase)} + ${(deal.countySurtaxRate * 100).toFixed(1)}% ${deal.buyer?.county ? `${deal.buyer.county} ` : ''}surtax on first ${money0(deal.surtaxCap)}${totals.tradeAllowanceTotal ? ` (trade allowance of ${money0(totals.tradeAllowanceTotal)} reduces the base)` : ''} — verify rates with accountant`
                  : 'Buyer pays tax when registering in their home state'}
            />

            {/* Credits */}
            <CalcRow sign="−" label="Deposit / Cash Received" amount={deal.depositCredit} editable={editable} onSave={(v) => patch({ depositCredit: v })} />
            <CalcRow
              sign="−"
              label={`Trade-In Equity${totals.tradePayoffTotal ? ` (${money0(totals.tradeAllowanceTotal)} allow − ${money0(totals.tradePayoffTotal)} payoff)` : ''}`}
              amount={totals.netTradeEquity}
              locked
              lockedHint="Edited in the Trade-In section above"
            />

            {/* Bottom line — DC-style: everything nets out to Amount Financed. */}
            <div style={{ marginTop: 10, paddingTop: 6, borderTop: '1px solid var(--border-light)' }}>
              <CalcRow
                sign="="
                label="Amount Financed"
                amount={totals.balanceDue}
                locked
                strong
                lockedHint="Price + fees + tax − deposit − trade equity"
              />
            </div>
          </div>

          <DealSnapshot
            deal={deal}
            totals={totals}
            onProceed={editable ? async () => {
              // Graduate the deal to the contract stage — from now on the
              // deals list opens the contract page for this deal.
              await patch({ markProceeded: true })
              router.push(`/deals/${deal.id}/finalize`)
            } : undefined}
          />
          </div>
        </div>

      {/* ── Modals ── */}
      {confirmAction && (
        <div className="mm-backdrop" onClick={() => setConfirmAction(null)}>
          <div className="mm-panel" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 400, padding: 22 }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-primary)', marginBottom: 8 }}>
              {confirmAction.title}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 16 }}>
              {confirmAction.body}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmAction(null)} style={{
                padding: '9px 16px', borderRadius: 12, minHeight: 0,
                border: '1px solid var(--border)', background: '#fff',
                fontSize: 13.5, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer',
              }}>Keep it</button>
              <button
                onClick={() => { const act = confirmAction; setConfirmAction(null); act.onConfirm() }}
                style={{
                  padding: '9px 18px', borderRadius: 12, minHeight: 0, border: 'none',
                  background: '#ef4444', color: '#fff',
                  fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
                }}
              >{confirmAction.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}

      {itemizer && (() => {
        // Anchor beside the box: prefer the right side; flip left when the
        // viewport runs out; clamp vertically so it never spills offscreen.
        // Accessories carry vendor/cost columns — wider panel.
        const W = itemizer.category === 'accessory' ? 840 : 460, H = 480
        const vw = window.innerWidth, vh = window.innerHeight
        let left = itemizer.rect.right + 10
        if (left + W > vw - 12) left = Math.max(12, itemizer.rect.left - W - 10)
        const top = Math.max(12, Math.min(itemizer.rect.top - 8, vh - H - 12))
        return (
          <LineItemizer
            category={itemizer.category}
            items={deal.lineItems.filter(i => i.category === itemizer.category)}
            anchor={{ top, left, width: W, maxHeight: H }}
            onClose={() => setItemizer(null)}
            onSave={async (items) => {
              const others = deal.lineItems.filter(i => i.category !== itemizer.category)
              const ok = await patch({ lineItems: [...others, ...items] })
              if (ok) setItemizer(null)
            }}
          />
        )
      })()}

      {vehiclePicker && (
        <VehicleSwapModal
          currentVehicleId={deal.vehicle.id}
          onClose={() => setVehiclePicker(false)}
          onPick={async (vehicleId) => {
            const ok = await patch({ vehicleId })
            if (ok) setVehiclePicker(false)
          }}
        />
      )}

    </div>
  )
}

// ─── Attach buyer (retail deal with no customer) ──────────────────────

function AttachBuyerCard({ editable, onAttach }: { editable: boolean; onAttach: (contactId: string) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ContactHit[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ limit: '15' })
        if (query.trim()) params.set('search', query.trim())
        const r = await fetch(`/api/contacts?${params}`)
        const d = await r.json()
        setResults(Array.isArray(d?.contacts) ? d.contacts : [])
      } catch { setResults([]) }
    }, 200)
    return () => clearTimeout(t)
  }, [query, open])

  return (
    <div style={{ ...card, padding: '18px 20px' }}>
      <div style={{ marginBottom: 14 }}>
        <SectionHeader
          tint="rgba(37,99,235,0.10)"
          tile={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>}
          title="Applicant Info"
          sub="No customer on this deal — attach the buyer"
        />
      </div>
      {editable ? (
        <div style={{ position: 'relative', maxWidth: 420 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 180)}
            placeholder="Search customers to attach…"
            style={{
              width: '100%', boxSizing: 'border-box', height: 36, padding: '0 12px',
              borderRadius: 10, border: '1px solid var(--border)', background: '#fff',
              fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', outline: 'none',
            }}
          />
          {open && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 40,
              background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
              boxShadow: '0 12px 32px -8px rgba(24,24,27,0.25)', padding: 4,
              maxHeight: 220, overflowY: 'auto',
            }}>
              {results.length === 0 ? (
                <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                  {query.trim() ? 'No matches.' : 'Start typing to search…'}
                </div>
              ) : results.map(c => (
                <button key={c.id} onMouseDown={() => { onAttach(c.id); setQuery('') }} style={{
                  width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 7,
                  border: 'none', minHeight: 0, background: 'transparent', cursor: 'pointer',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-primary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{c.firstName} {c.lastName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    {[c.phone, c.email].filter(Boolean).join(' · ') || '—'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No buyer attached.</div>
      )}
    </div>
  )
}

// ─── Business Info (wholesale buyer) ─────────────────────────────────

type BusinessHit = { id: string; businessName: string; tradeName: string | null; city: string | null; state: string | null; phone: string | null }

function BusinessCard({ business, editable, onAttach, onDetach, onSave }: {
  business: BusinessBuyer | null
  editable: boolean
  onAttach: (businessId: string) => void
  onDetach: () => void
  onSave: (fields: Record<string, unknown>) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BusinessHit[]>([])
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!open || business) return
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams()
        if (query.trim()) params.set('search', query.trim())
        const r = await fetch(`/api/businesses?${params}`)
        const d = await r.json()
        setResults(Array.isArray(d?.businesses) ? d.businesses : [])
      } catch { setResults([]) }
    }, 200)
    return () => clearTimeout(t)
  }, [query, open, business])

  async function createAndAttach() {
    const name = query.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName: name }),
      })
      const d = await res.json()
      if (res.ok) { onAttach(d.business.id); setQuery('') }
    } finally {
      setCreating(false)
    }
  }

  const header = (
    <SectionHeader
      tint="rgba(2,132,199,0.10)"
      tile={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M9 13h1M9 17h1M14 9h1M14 13h1M14 17h1" /></svg>}
      title="Business Info"
      sub={business ? 'Wholesale buyer — edits save to the business record' : 'Wholesale buyer — search or create a business'}
    />
  )

  if (!business) {
    return (
      <div style={{ ...card, padding: '18px 20px' }}>
        <div style={{ marginBottom: 14 }}>{header}</div>
        {editable ? (
          <div style={{ position: 'relative', maxWidth: 460 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 180)}
              placeholder="Search businesses by name or Tax ID…"
              style={{
                width: '100%', boxSizing: 'border-box', height: 36, padding: '0 12px',
                borderRadius: 10, border: '1px solid var(--border)', background: '#fff',
                fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', outline: 'none',
              }}
            />
            {open && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 40,
                background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
                boxShadow: '0 12px 32px -8px rgba(24,24,27,0.25)', padding: 4,
                maxHeight: 240, overflowY: 'auto',
              }}>
                {results.map(bz => (
                  <button key={bz.id} onMouseDown={() => { onAttach(bz.id); setQuery('') }} style={{
                    width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 7,
                    border: 'none', minHeight: 0, background: 'transparent', cursor: 'pointer',
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-primary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{bz.businessName}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                      {[bz.tradeName, [bz.city, bz.state].filter(Boolean).join(', '), bz.phone].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </button>
                ))}
                {query.trim() && (
                  <button onMouseDown={createAndAttach} disabled={creating} style={{
                    width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 7,
                    border: 'none', minHeight: 0, cursor: 'pointer',
                    background: 'transparent', borderTop: results.length ? '1px solid var(--border-light)' : 'none',
                    fontSize: 12.5, fontWeight: 700, color: '#0284c7',
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-primary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >+ Create “{query.trim()}”</button>
                )}
                {!results.length && !query.trim() && (
                  <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                    Type a business name — pick an existing one or create it.
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No business attached.</div>
        )}
      </div>
    )
  }

  const f = (key: keyof BusinessBuyer) => (v: string | number | null) => onSave({ [key]: v })

  return (
    <div style={{ ...card, padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        {header}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '5px 12px 5px 6px', borderRadius: 100,
            border: '1px solid var(--border)', background: 'var(--bg-primary)',
          }}>
            <span style={{
              width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
              background: '#0284c7', color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700,
            }}>{business.businessName.slice(0, 2).toUpperCase()}</span>
            <span style={{
              fontSize: 12.5, fontWeight: 640, letterSpacing: '-0.01em', color: 'var(--text-primary)',
              maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{business.businessName}</span>
          </span>
          {editable && (
            <button onClick={onDetach} title="Detach business" style={{
              width: 24, height: 24, minHeight: 0, borderRadius: 7, border: 'none', padding: 0,
              background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.12s ease, color 0.12s ease',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.10)'; e.currentTarget.style.color = '#ef4444' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      <FieldGroup
        legend="Business"
        filled={countFilled([business.businessName, business.tradeName, business.enterpriseType, business.taxId, business.yearsInBusiness, business.monthsInBusiness, business.grossMonthlyIncome, business.typeOfBusiness])}
        total={8}
      >
        <Grid12>
          <Cell span={4}><JField label="Business Name" required value={business.businessName} onSave={(v) => v && onSave({ businessName: v })} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={3}><JField label="Trade Name" value={business.tradeName} onSave={f('tradeName')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={3}><JSelect label="Enterprise Type" required value={business.enterpriseType} options={ENTERPRISE_TYPES} onSave={f('enterpriseType')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={2}><JField label="Tax ID" value={business.taxId} onSave={f('taxId')} editable={editable} flex="1 1 auto" /></Cell>

          <Cell span={2}><JField label="Years in Business" value={business.yearsInBusiness} onSave={f('yearsInBusiness')} editable={editable} kind="int" flex="1 1 auto" /></Cell>
          <Cell span={2}><JField label="Months" value={business.monthsInBusiness} onSave={f('monthsInBusiness')} editable={editable} kind="int" flex="1 1 auto" /></Cell>
          <Cell span={3}><JField label="Gross Profit / Monthly" value={business.grossMonthlyIncome} onSave={f('grossMonthlyIncome')} editable={editable} kind="money" flex="1 1 auto" /></Cell>
          <Cell span={5}><JField label="Type of Business" value={business.typeOfBusiness} onSave={f('typeOfBusiness')} editable={editable} flex="1 1 auto" /></Cell>
        </Grid12>
      </FieldGroup>

      <FieldGroup
        legend="Address & Contact"
        filled={countFilled([business.street, business.city, business.state, business.zip, business.county, business.lengthAtAddressYears, business.mortgageType, business.phone, business.email])}
        total={9}
      >
        <Grid12>
          <Cell span={5}><JField label="Street" required value={business.street} onSave={f('street')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={3}><JField label="City" required value={business.city} onSave={f('city')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={1}><JField label="State" required value={business.state} onSave={f('state')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={1}><JField label="Zip" required value={business.zip} onSave={f('zip')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={2}><JField label="County" value={business.county} onSave={f('county')} editable={editable} flex="1 1 auto" /></Cell>

          <Cell span={2}><JField label="Years at Addr." value={business.lengthAtAddressYears} onSave={f('lengthAtAddressYears')} editable={editable} kind="int" flex="1 1 auto" /></Cell>
          <Cell span={2}><JField label="Months" value={business.lengthAtAddressMonths} onSave={f('lengthAtAddressMonths')} editable={editable} kind="int" flex="1 1 auto" /></Cell>
          <Cell span={3}><JSelect label="Mortgage Type" value={business.mortgageType} options={MORTGAGE_TYPES} onSave={f('mortgageType')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={2}><JField label="Phone" value={business.phone} onSave={f('phone')} editable={editable} kind="phone" flex="1 1 auto" /></Cell>
          <Cell span={3}><JField label="Email" value={business.email} onSave={f('email')} editable={editable} flex="1 1 auto" /></Cell>
        </Grid12>
      </FieldGroup>

      <FieldGroup
        legend="Fleet & History"
        filled={countFilled([business.vehiclesFinanced, business.vehiclesOwned, business.aggregateMonthlyPmt, business.loanLease, business.operatingLease, business.priorBankruptcy, business.priorRepossession, business.lawsuitParty, business.delinquentTaxes])}
        total={9}
      >
        <Grid12>
          <Cell span={2}><JField label="Vehicles Financed" value={business.vehiclesFinanced} onSave={f('vehiclesFinanced')} editable={editable} kind="int" flex="1 1 auto" /></Cell>
          <Cell span={2}><JField label="Vehicles Owned" value={business.vehiclesOwned} onSave={f('vehiclesOwned')} editable={editable} kind="int" flex="1 1 auto" /></Cell>
          <Cell span={3}><JField label="Aggregate Monthly Pmt" value={business.aggregateMonthlyPmt} onSave={f('aggregateMonthlyPmt')} editable={editable} kind="money" flex="1 1 auto" /></Cell>
          <Cell span={2}><JField label="Loan / Lease" value={business.loanLease} onSave={f('loanLease')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={3}><JField label="Operating Lease" value={business.operatingLease} onSave={f('operatingLease')} editable={editable} flex="1 1 auto" /></Cell>

          <Cell span={3}><JSelect label="Prior Bankruptcy" value={business.priorBankruptcy} options={YES_NO} onSave={f('priorBankruptcy')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={3}><JSelect label="Prior Repossession" value={business.priorRepossession} options={YES_NO} onSave={f('priorRepossession')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={3}><JSelect label="Party to a Lawsuit" value={business.lawsuitParty} options={YES_NO} onSave={f('lawsuitParty')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={3}><JSelect label="Delinquent Taxes" value={business.delinquentTaxes} options={YES_NO} onSave={f('delinquentTaxes')} editable={editable} flex="1 1 auto" /></Cell>
        </Grid12>
      </FieldGroup>

      <FieldGroup
        legend="Operator"
        filled={countFilled([business.operatorFirstName, business.operatorLastName, business.operatorStreet, business.operatorCity, business.operatorState, business.operatorZip, business.operatorCounty])}
        total={7}
      >
        <Grid12>
          <Cell span={3}><JField label="First Name" value={business.operatorFirstName} onSave={f('operatorFirstName')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={3}><JField label="Last Name" value={business.operatorLastName} onSave={f('operatorLastName')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={6}><JField label="Street" value={business.operatorStreet} onSave={f('operatorStreet')} editable={editable} flex="1 1 auto" /></Cell>

          <Cell span={4}><JField label="City" value={business.operatorCity} onSave={f('operatorCity')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={2}><JField label="State" value={business.operatorState} onSave={f('operatorState')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={2}><JField label="Zip" value={business.operatorZip} onSave={f('operatorZip')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={4}><JField label="County" value={business.operatorCounty} onSave={f('operatorCounty')} editable={editable} flex="1 1 auto" /></Cell>
        </Grid12>
      </FieldGroup>

      <FieldGroup
        legend="Principal"
        filled={countFilled([business.principalFirstName, business.principalLastName, business.principalJobTitle, business.principalPhone, business.principalDob, business.principalOwnershipPct, business.principalStreet, business.principalCity, business.principalState, business.principalZip, business.principalCounty])}
        total={11}
      >
        <Grid12>
          <Cell span={3}><JField label="First Name" value={business.principalFirstName} onSave={f('principalFirstName')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={3}><JField label="Last Name" value={business.principalLastName} onSave={f('principalLastName')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={3}><JField label="Job Title" value={business.principalJobTitle} onSave={f('principalJobTitle')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={3}><JField label="Phone" value={business.principalPhone} onSave={f('principalPhone')} editable={editable} kind="phone" flex="1 1 auto" /></Cell>

          <Cell span={3}><JField label="Date of Birth" value={business.principalDob} onSave={f('principalDob')} editable={editable} kind="date" flex="1 1 auto" /></Cell>
          <Cell span={2}><JField label="% Ownership" value={business.principalOwnershipPct} onSave={f('principalOwnershipPct')} editable={editable} kind="int" flex="1 1 auto" /></Cell>
          <Cell span={7}><JField label="Street" value={business.principalStreet} onSave={f('principalStreet')} editable={editable} flex="1 1 auto" /></Cell>

          <Cell span={4}><JField label="City" value={business.principalCity} onSave={f('principalCity')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={2}><JField label="State" value={business.principalState} onSave={f('principalState')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={2}><JField label="Zip" value={business.principalZip} onSave={f('principalZip')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={4}><JField label="County" value={business.principalCounty} onSave={f('principalCounty')} editable={editable} flex="1 1 auto" /></Cell>
        </Grid12>
      </FieldGroup>
    </div>
  )
}

// ─── Deal Snapshot — live overview of every section, beside the money ─

function DealSnapshot({ deal, totals, onProceed }: { deal: Deal; totals: DealTotals; onProceed?: () => void }) {
  const isWholesale = deal.dealType === 'wholesale'
  const b = deal.buyer
  const bz = deal.businessBuyer

  // Retail requireds: identity basics; ID type/state/number; residence
  // street/city/state/county; cell phone.
  const reqMissing = !isWholesale && b
    ? ([
        ['First name', b.firstName], ['Last name', b.lastName], ['Date of birth', b.dateOfBirth],
        ['ID type', b.idType], ['ID state', b.idState], ['ID number', b.idNo],
        ['Street', b.address], ['City', b.city], ['State', b.state], ['County', b.county],
        ['Cell phone', b.phone],
      ] as Array<[string, string | null]>).filter(([, x]) => !x).map(([l]) => l)
    : []

  // Wholesale requireds (per operator): business name, enterprise type,
  // street, city, state, zip.
  const bizMissing = isWholesale && bz
    ? ([
        ['Business name', bz.businessName], ['Enterprise type', bz.enterpriseType],
        ['Street', bz.street], ['City', bz.city], ['State', bz.state], ['Zip', bz.zip],
      ] as Array<[string, string | null]>).filter(([, x]) => !x).map(([l]) => l)
    : []

  // Vehicle requireds: VIN, year, mileage, trim, model, make.
  const v = deal.vehicle
  const vehicleMissing = ([
    ['VIN', v.vin], ['Year', v.year], ['Make', v.make],
    ['Model', v.model], ['Trim', v.trim], ['Mileage', v.mileage],
  ] as Array<[string, string | number | null]>).filter(([, x]) => x == null || x === '').map(([l]) => l)

  const hasEmp = Boolean(b?.employerName || b?.employmentType || b?.employerMonthlyIncome)
  const priceOk = deal.salePrice > 0
  const blockers = [
    ...(priceOk ? [] : ['sale price']),
    ...(isWholesale
      ? !bz
        ? ['business buyer']
        : bizMissing.length ? [`${bizMissing.length} business field${bizMissing.length > 1 ? 's' : ''}`] : []
      : !b
        ? ['a buyer']
        : reqMissing.length ? [`${reqMissing.length} applicant field${reqMissing.length > 1 ? 's' : ''}`] : []),
    ...(vehicleMissing.length ? [`${vehicleMissing.length} vehicle field${vehicleMissing.length > 1 ? 's' : ''}`] : []),
  ]
  const ready = blockers.length === 0

  const Row = ({ label, value, tone = 'muted' }: { label: string; value: string; tone?: 'ok' | 'warn' | 'muted' }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9.5px 0', borderBottom: '1px solid var(--border-light)' }}>
      <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)', flexShrink: 0 }}>{label}</span>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 12.5, fontWeight: 600, textAlign: 'right', minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: tone === 'ok' ? '#16a34a' : tone === 'warn' ? '#d97706' : 'var(--text-primary)',
      }}>
        {tone === 'ok' && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M20 6 9 17l-5-5" /></svg>
        )}
        {value}
      </span>
    </div>
  )

  return (
    // Stretches to the calculator's height; rows breathe evenly and the
    // Proceed button anchors to the bottom edge.
    <div style={{ ...card, padding: '18px 20px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 12 }}>
        <SectionHeader
          tint="rgba(217,119,6,0.10)"
          tile={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>}
          title="Deal Snapshot"
          sub="Where this deal stands"
        />
      </div>

      {/* Verdict banner */}
      <div style={{
        padding: '9px 13px', borderRadius: 10, marginBottom: 6,
        background: ready ? '#edfaf0' : '#fdf3e7',
        border: `1px solid ${ready ? '#bbf7d0' : '#fde68a'}`,
        fontSize: 12.5, fontWeight: 700,
        color: ready ? '#16a34a' : '#b45309',
      }}>
        {ready
          ? '✓ Ready to fund'
          : `Needs ${blockers.join(' · ')}`}
      </div>

      {isWholesale ? (
        <Row
          label="Business"
          value={!bz
            ? 'Not attached'
            : bizMissing.length === 0 ? bz.businessName : `${bizMissing.length} required missing`}
          tone={!bz ? 'warn' : bizMissing.length === 0 ? 'ok' : 'warn'}
        />
      ) : (
        <>
          <Row
            label="Applicant"
            value={!b ? 'Not attached' : reqMissing.length === 0 ? 'Complete' : `${reqMissing.length} required missing`}
            tone={!b ? 'warn' : reqMissing.length === 0 ? 'ok' : 'warn'}
          />
          <Row label="Employment" value={hasEmp ? 'On file' : 'Not added'} tone={hasEmp ? 'ok' : 'muted'} />
          <Row
            label="Co-Buyer"
            value={deal.coBuyer
              ? `${deal.coBuyer.firstName} ${deal.coBuyer.lastName}${b?.coBuyerRelationship ? ` · ${b.coBuyerRelationship}` : ''}`
              : 'None'}
            tone={deal.coBuyer ? 'ok' : 'muted'}
          />
        </>
      )}
      <Row
        label="Trade-In"
        value={deal.trades.length
          ? `${deal.trades.length} · Net ${totals.netTradeEquity < 0 ? '−' : ''}${money0(Math.abs(totals.netTradeEquity))}`
          : 'None'}
        tone={deal.trades.length ? 'ok' : 'muted'}
      />
      <Row
        label="Vehicle"
        value={vehicleMissing.length === 0
          ? `Complete${deal.vehicle.titleBrand ? ` · ${deal.vehicle.titleBrand}` : ''}`
          : `${vehicleMissing.length} required missing`}
        tone={vehicleMissing.length === 0 ? 'ok' : 'warn'}
      />
      <Row label="Sale Price" value={priceOk ? money0(deal.salePrice) : 'Not set'} tone={priceOk ? 'ok' : 'warn'} />
      <Row
        label="Tax"
        value={isWholesale
          ? 'Wholesale · $0'
          : deal.collectTax
            ? `FL ${((deal.stateTaxRate + deal.countySurtaxRate) * 100).toFixed(1)}% · ${money0(totals.taxAmount)}`
            : 'Out-of-state · $0'}
        tone="muted"
      />

      {/* Deal identity — quiet footer that soaks up the leftover height
          (this info lost its home when the header + meta card went away). */}
      <div style={{ marginTop: 'auto', paddingTop: 14 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px',
          padding: '10px 13px', borderRadius: 10,
          background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        }}>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            Deal <strong style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{formatDealNumber(deal.dealNumber)}</strong>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', textAlign: 'right' }}>
            Rep <strong style={{ color: 'var(--text-secondary)' }}>{deal.salesRep?.name || '—'}</strong>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', gridColumn: 'span 2' }}>
            Created {new Date(deal.createdAt).toLocaleDateString()}{deal.createdBy ? ` by ${deal.createdBy.name}` : ''}
          </div>
        </div>
      </div>

      {onProceed && (
        <div style={{ paddingTop: 14 }}>
        <button
          onClick={ready ? onProceed : undefined}
          disabled={!ready}
          title={ready ? undefined : `Complete required fields first: ${blockers.join(' · ')}`}
          style={{
            width: '100%', padding: '12px 20px', borderRadius: 12,
            minHeight: 0, border: 'none',
            background: ready ? '#1a1a1a' : 'var(--lane-bg)',
            color: ready ? '#ffffff' : 'var(--text-muted)',
            fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.005em',
            cursor: ready ? 'pointer' : 'not-allowed',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: ready ? '0 6px 16px -8px rgba(24,24,27,0.35)' : 'none',
            transition: 'background 0.18s ease, color 0.18s ease, transform 0.15s ease',
          }}
          onMouseEnter={(e) => { if (ready) { e.currentTarget.style.background = '#2a2a2a'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
          onMouseLeave={(e) => { if (ready) { e.currentTarget.style.background = '#1a1a1a'; e.currentTarget.style.transform = 'none' } }}
        >
          Proceed with Deal
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
        </div>
      )}
    </div>
  )
}

function emptyTrade(): Trade {
  return {
    vin: null, year: null, make: null, model: null, trim: null,
    mileage: null, color: null, allowance: 0, acv: 0, payoff: 0,
    lienholder: null, notes: null,
  }
}

// ─── Calculator row ───────────────────────────────────────────────────
// DC-style: sign, label, then either a live $ input, an itemized box that
// opens the ⋮ editor, or a locked computed box (tax, trade equity).

function CalcRow({ sign, label, amount, editable, onSave, itemized, itemCount, onOpen, locked, lockedHint, strong }: {
  sign: '+' | '−' | '='
  label: string
  amount: number
  editable?: boolean
  onSave?: (v: number) => void
  itemized?: boolean
  itemCount?: number
  /** Receives the box's screen rect so the itemizer can anchor beside it. */
  onOpen?: (rect: DOMRect) => void
  locked?: boolean
  lockedHint?: string
  strong?: boolean
}) {
  const [active, setActive] = useState(false)
  return (
    // Half-width card: label left, box right — and the label lights up
    // (lime highlighter) whenever its box is hovered or focused, so
    // there's never a question of which line you're editing.
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0' }}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      <span style={{ width: 14, textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>{sign}</span>
      <span style={{
        flex: 1, minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }} title={lockedHint ?? label}>
        <span style={{
          fontSize: 13.5, fontWeight: active ? 700 : strong ? 640 : 500,
          color: active ? '#1a1a1a' : strong ? 'var(--text-primary)' : 'var(--text-secondary)',
          background: active ? 'rgba(24,24,27,0.06)' : 'transparent',
          borderRadius: 4, padding: '1px 5px', margin: '-1px -5px',
          transition: 'background 0.18s ease, color 0.18s ease',
        }}>{label}</span>
      </span>

      {itemized ? (
        <button
          onClick={(e) => onOpen?.(e.currentTarget.getBoundingClientRect())}
          disabled={!editable && !itemCount}
          title={editable ? 'Itemize' : 'View items'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
            width: 168, height: 36, boxSizing: 'border-box', padding: '0 8px 0 12px',
            borderRadius: 10, border: '1px solid var(--border)', background: '#fff',
            cursor: 'pointer', boxShadow: 'var(--shadow-sm)',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#c4e050'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(223,253,110,0.2)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)' }}
        >
          <span style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
            {money(amount)}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
            <circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" />
          </svg>
        </button>
      ) : locked ? (
        <div title={lockedHint} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
          width: 168, height: 36, boxSizing: 'border-box', padding: '0 10px 0 12px',
          borderRadius: 10, border: '1px solid var(--border-light)', background: 'var(--bg-primary)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
            {money(amount)}
          </span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
      ) : (
        <MoneyBox value={amount} editable={!!editable} onSave={(v) => onSave?.(v)} />
      )}
    </div>
  )
}

function MoneyBox({ value, editable, onSave }: { value: number; editable: boolean; onSave: (v: number) => void }) {
  const [draft, setDraft] = useState(value ? String(value) : '')
  const [focused, setFocused] = useState(false)
  // Keep showing what was typed through the save round-trip; only resync
  // the draft when the server-confirmed value actually changes.
  const lastValue = useRef(value)
  useEffect(() => {
    if (lastValue.current !== value) {
      lastValue.current = value
      if (!focused) setDraft(value ? String(value) : '')
    }
  }, [value, focused])

  function commit() {
    setFocused(false)
    const n = parseFloat(draft.replace(/[^0-9.]/g, ''))
    const v = Number.isNaN(n) ? 0 : n
    if (v !== value) onSave(v)
  }

  if (!editable) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        width: 168, height: 36, boxSizing: 'border-box', padding: '0 12px',
        borderRadius: 10, border: '1px solid var(--border-light)', background: 'var(--bg-primary)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{money(value)}</span>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      width: 168, height: 36, boxSizing: 'border-box', padding: '0 12px',
      borderRadius: 10,
      border: focused ? '1px solid #c4e050' : '1px solid var(--border)',
      background: focused ? '#fff' : 'var(--bg-primary)',
      boxShadow: focused ? '0 0 0 3px rgba(223,253,110,0.2)' : 'var(--shadow-sm)',
      transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    }}>
      <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600 }}>$</span>
      <input
        value={focused
          ? draft
          : (() => { const n = parseFloat(draft.replace(/[^0-9.]/g, '')); return Number.isNaN(n) || !n ? '' : n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0 }) })()}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') { setDraft(String(value || '')); e.currentTarget.blur() }
        }}
        placeholder="0"
        inputMode="decimal"
        style={{
          flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
          fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums',
          color: 'var(--text-primary)', textAlign: 'right', padding: 0,
        }}
      />
    </div>
  )
}

// FL / out-of-state segmented toggle — sliding thumb glides between the
// two options instead of the highlight teleporting.
function TaxToggle({ collect, disabled, onChange }: { collect: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  const opts = [
    { key: true, label: 'FL Buyer' },
    { key: false, label: 'Out-of-State' },
  ]
  return (
    <div style={{
      position: 'relative',
      display: 'grid', gridTemplateColumns: '1fr 1fr',
      padding: 4, background: 'var(--bg-primary)', borderRadius: 12,
    }}>
      {/* Sliding thumb */}
      <span style={{
        position: 'absolute', top: 4, bottom: 4, left: 4,
        width: 'calc(50% - 4px)',
        background: 'var(--bg-card)', borderRadius: 9,
        boxShadow: '0 1px 3px rgba(24,24,27,0.10)',
        transform: collect ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1)',
        pointerEvents: 'none',
      }} />
      {opts.map(o => {
        const active = collect === o.key
        return (
          <button
            key={String(o.key)}
            disabled={disabled}
            onClick={() => !active && onChange(o.key)}
            style={{
              position: 'relative', zIndex: 1,
              padding: '5px 14px', borderRadius: 9, border: 'none', minHeight: 0,
              background: 'transparent',
              color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 12, fontWeight: 600, cursor: disabled || active ? 'default' : 'pointer',
              whiteSpace: 'nowrap',
              transition: 'color 0.2s ease',
            }}
          >{o.label}</button>
        )
      })}
    </div>
  )
}

// ─── Trade-in card ────────────────────────────────────────────────────

function TradeCard({ index, trade, editable, onChange, onRemove }: {
  index: number
  trade: Trade
  editable: boolean
  onChange: (t: Trade) => void
  onRemove: () => void
}) {
  // Each field is a JField committing on blur — one PATCH per completed
  // edit, same rhythm and filled/empty pill language as the applicant form.
  const set = (key: keyof Trade) => (v: string | number | null) => {
    const next = { ...trade, [key]: key === 'allowance' || key === 'acv' || key === 'payoff' ? (v ?? 0) : v }
    onChange(next as Trade)
  }
  const netEquity = (trade.allowance || 0) - (trade.payoff || 0)
  const cell = (span: number, child: React.ReactNode) => (
    <div style={{ gridColumn: `span ${span}`, minWidth: 0 }}>{child}</div>
  )

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 12,
      background: 'var(--bg-primary)', padding: '13px 16px 15px',
    }}>
      {/* Header: label · net equity · remove */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <span style={{ ...eyebrow, fontSize: 10 }}>Trade {index + 1}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {(trade.allowance || trade.payoff) ? (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
              fontVariantNumeric: 'tabular-nums',
              background: netEquity >= 0 ? '#edfaf0' : '#fdecef',
              color: netEquity >= 0 ? '#16a34a' : '#e11d48',
            }}>
              Net {netEquity < 0 ? '−' : ''}{money0(Math.abs(netEquity))}
            </span>
          ) : null}
          {editable && (
            <button onClick={onRemove} title="Remove trade" style={{
              width: 24, height: 24, minHeight: 0, borderRadius: 7, border: 'none', padding: 0,
              background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.12s ease, color 0.12s ease',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.10)'; e.currentTarget.style.color = '#ef4444' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Vehicle row — fixed 12-col grid keeps every card aligned */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 10 }}>
        {cell(3, <JField label="VIN" value={trade.vin} onSave={set('vin')} editable={editable} flex="1 1 auto" />)}
        {cell(1, <JField label="Year" value={trade.year} onSave={set('year')} editable={editable} kind="int" flex="1 1 auto" />)}
        {cell(2, <JField label="Make" value={trade.make} onSave={set('make')} editable={editable} flex="1 1 auto" />)}
        {cell(3, <JField label="Model" value={trade.model} onSave={set('model')} editable={editable} flex="1 1 auto" />)}
        {cell(1, <JField label="Trim" value={trade.trim} onSave={set('trim')} editable={editable} flex="1 1 auto" />)}
        {cell(2, <JField label="Mileage" value={trade.mileage} onSave={set('mileage')} editable={editable} kind="int" flex="1 1 auto" />)}
      </div>

      <div style={{ height: 1, background: 'var(--border-light)', margin: '12px 0' }} />

      {/* Valuation row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 10 }}>
        {cell(2, <JField label="Allowance" value={trade.allowance || null} onSave={set('allowance')} editable={editable} kind="money" flex="1 1 auto" />)}
        {cell(2, <JField label="ACV" value={trade.acv || null} onSave={set('acv')} editable={editable} kind="money" flex="1 1 auto" />)}
        {cell(2, <JField label="Payoff" value={trade.payoff || null} onSave={set('payoff')} editable={editable} kind="money" flex="1 1 auto" />)}
        {cell(6, <JField label="Lienholder" value={trade.lienholder} onSave={set('lienholder')} editable={editable} flex="1 1 auto" />)}
      </div>
    </div>
  )
}

// ─── Line-item editor (the ⋮ modal) ──────────────────────────────────

function LineItemizer({ category, items, anchor, onClose, onSave }: {
  category: string
  items: LineItem[]
  anchor: { top: number; left: number; width: number; maxHeight: number }
  onClose: () => void
  onSave: (items: LineItem[]) => void
}) {
  const catLabel = LINE_ITEM_CATEGORIES.find(c => c.key === category)?.label ?? category
  const [rows, setRows] = useState<LineItem[]>(items.length ? items.map(i => ({ ...i })) : [])
  const presets = LINE_ITEM_PRESETS[category] ?? []
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Popover, not modal: no backdrop, so close on any outside click.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  const total = rows.reduce((s, r) => s + (r.amount || 0), 0)

  // Taxability is hard-set: presets carry their flag, custom lines take the
  // category default. Not user-facing — accountant-level detail.
  function addRow(label = '', taxable = CATEGORY_TAXABLE_DEFAULT[category] ?? false) {
    setRows(r => [...r, {
      category, label, amount: 0, taxable,
      ...(category === 'accessory' ? { deductFrom: 'back_gross' } : {}),
    }])
  }

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed', top: anchor.top, left: anchor.left, width: anchor.width,
        maxHeight: anchor.maxHeight, zIndex: 70,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
        boxShadow: '0 24px 64px -16px rgba(24,24,27,0.35), 0 6px 16px -8px rgba(24,24,27,0.18)',
        animation: 'mm-pop 0.18s cubic-bezier(0.2,0.8,0.2,1)',
      }}
    >
        {/* Header */}
        <div style={{ padding: '14px 18px 11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>{catLabel}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Itemized lines — tax is handled automatically
            </div>
          </div>
          <button className="mm-close" onClick={onClose} style={{ border: 'none', cursor: 'pointer' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Presets */}
        {presets.length > 0 && (
          <div style={{ padding: '11px 18px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {presets.filter(p => !rows.some(r => r.label === p.label)).map(p => (
              <button key={p.label} onClick={() => addRow(p.label, p.taxable)} style={{
                padding: '5px 11px', borderRadius: 100, minHeight: 0,
                border: '1px solid var(--border)', background: '#fff',
                fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer',
                transition: 'border-color 0.12s ease, color 0.12s ease',
              }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#c4e050'; e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
              >+ {p.label}</button>
            ))}
          </div>
        )}

        {/* Rows */}
        <div style={{ padding: '12px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
          {rows.length === 0 && (
            <div style={{ padding: '18px 0', fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center' }}>
              No {catLabel.toLowerCase()} yet — use a quick-pick above or add a custom line.
            </div>
          )}
          {/* Column headers — accessory mode has real columns */}
          {category === 'accessory' && rows.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 2 }}>
              {(['Description', 'Price', 'Cost', 'Item #', 'Vendor', 'Deduct From', ''] as const).map((h, hi) => (
                <span key={hi} style={{
                  ...(hi === 0 ? { flex: 1, minWidth: 0 } : { width: [0, 96, 96, 110, 168, 118, 28][hi], flexShrink: 0 }),
                  fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>{h}</span>
              ))}
            </div>
          )}
          {rows.map((r, i) => {
            const up = (p: Partial<LineItem>) => setRows(rs => rs.map((x, j) => j === i ? { ...x, ...p } : x))
            const textBox = (value: string, onChange: (v: string) => void, placeholder: string, width?: number) => (
              <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                style={{
                  ...(width ? { width, flexShrink: 0 } : { flex: 1, minWidth: 0 }),
                  height: 36, boxSizing: 'border-box', padding: '0 10px',
                  borderRadius: 10, border: '1px solid var(--border)', background: '#fff',
                  fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)', outline: 'none',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#c4e050'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(223,253,110,0.2)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
              />
            )
            const moneyBox = (value: number | null | undefined, onChange: (v: number | null) => void, width: number) => (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                width, flexShrink: 0, height: 36, boxSizing: 'border-box', padding: '0 10px',
                borderRadius: 10, border: '1px solid var(--border)', background: '#fff',
              }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>$</span>
                <input
                  value={value ? String(value) : ''}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value.replace(/[^0-9.]/g, ''))
                    onChange(Number.isNaN(n) ? null : n)
                  }}
                  placeholder="0"
                  inputMode="decimal"
                  style={{
                    flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
                    fontSize: 12.5, fontWeight: 500, fontVariantNumeric: 'tabular-nums',
                    color: 'var(--text-primary)', textAlign: 'right', padding: 0,
                  }}
                />
              </div>
            )
            const removeBtn = (
              <button onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} title="Remove line" style={{
                width: 28, height: 28, minHeight: 0, borderRadius: 8, border: 'none', padding: 0, flexShrink: 0,
                background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.12s ease, color 0.12s ease',
              }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.10)'; e.currentTarget.style.color = '#ef4444' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            )

            if (category !== 'accessory') {
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {textBox(r.label, (v) => up({ label: v }), 'Line description')}
                  {moneyBox(r.amount, (v) => up({ amount: v ?? 0 }), 118)}
                  {removeBtn}
                </div>
              )
            }

            // Accessory row — DC layout: desc · price · cost · item # ·
            // vendor (Partner search) · deduct from · remove.
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {textBox(r.label, (v) => up({ label: v }), 'Description')}
                {moneyBox(r.amount, (v) => up({ amount: v ?? 0 }), 96)}
                {moneyBox(r.cost ?? null, (v) => up({ cost: v }), 96)}
                {textBox(r.itemNumber ?? '', (v) => up({ itemNumber: v || null }), 'Item #', 110)}
                <VendorCell
                  name={r.vendorPartner?.companyName ?? null}
                  onPick={(id, name) => up({ vendorPartnerId: id, vendorPartner: { id, companyName: name } })}
                  onClear={() => up({ vendorPartnerId: null, vendorPartner: null })}
                />
                <DeductCell
                  value={r.deductFrom ?? 'back_gross'}
                  onChange={(v) => up({ deductFrom: v })}
                />
                {removeBtn}
              </div>
            )
          })}
          {/* Fees stick to the standard sheet — custom lines only for the
              other categories (accessories, products, insurance). */}
          {category !== 'fee' && (
            <button onClick={() => addRow()} style={{
              alignSelf: 'flex-start', padding: '7px 12px', minHeight: 0, borderRadius: 10,
              border: '1.5px dashed var(--border)', background: 'transparent',
              fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer',
              transition: 'border-color 0.12s ease, color 0.12s ease',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#c4e050'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
            >+ Add custom line</button>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '11px 18px', borderTop: '1px solid var(--border-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Total <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{money(total)}</strong>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{
              padding: '9px 16px', borderRadius: 12, minHeight: 0,
              border: '1px solid var(--border)', background: '#fff',
              fontSize: 13.5, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer',
            }}>Discard</button>
            <button
              onClick={() => onSave(rows.filter(r => r.label.trim() || r.amount))}
              style={{
                padding: '9px 18px', borderRadius: 12, minHeight: 0, border: 'none',
                background: '#1a1a1a', color: '#ffffff',
                fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
              }}
            >Save Items</button>
          </div>
        </div>
    </div>
  )
}

// ─── Accessory row cells: vendor picker + deduct-from ────────────────

// Attaches a vendor from the Partner list to an accessory line.
function VendorCell({ name, onPick, onClear }: {
  name: string | null
  onPick: (id: string, name: string) => void
  onClear: () => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hits, setHits] = useState<Array<{ id: string; companyName: string }>>([])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ limit: '10' })
        if (q.trim()) params.set('search', q.trim())
        const r = await fetch(`/api/partners?${params}`)
        const d = await r.json()
        setHits(Array.isArray(d?.partners) ? d.partners : [])
      } catch { setHits([]) }
    }, 200)
    return () => clearTimeout(t)
  }, [q, open])

  return (
    <div style={{ position: 'relative', width: 168, flexShrink: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        height: 36, boxSizing: 'border-box', padding: '0 8px 0 10px',
        borderRadius: 10, border: '1px solid var(--border)', background: '#fff',
      }}>
        <input
          value={open ? q : (name ?? '')}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { setOpen(true); setQ('') }}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          placeholder="+ Vendor"
          style={{
            flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', padding: 0,
          }}
        />
        {name && !open ? (
          <button onMouseDown={(e) => { e.preventDefault(); onClear() }} title="Remove vendor" style={{
            width: 18, height: 18, minHeight: 0, borderRadius: 5, border: 'none', padding: 0, flexShrink: 0,
            background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
          </svg>
        )}
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, width: 230, zIndex: 90,
          background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 12px 32px -8px rgba(24,24,27,0.25)', padding: 4,
          maxHeight: 190, overflowY: 'auto',
        }}>
          {hits.length === 0 ? (
            <div style={{ padding: 10, fontSize: 11.5, color: 'var(--text-muted)', textAlign: 'center' }}>
              {q.trim() ? 'No vendors found.' : 'Type to search vendors…'}
            </div>
          ) : hits.map(h => (
            <button key={h.id} onMouseDown={() => { onPick(h.id, h.companyName); setOpen(false); setQ('') }} style={{
              width: '100%', textAlign: 'left', padding: '7px 9px', borderRadius: 7,
              border: 'none', minHeight: 0, background: 'transparent', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-primary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >{h.companyName}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// Front Gross / Back Gross classification for the accessory's cost.
function DeductCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const OPTIONS = [
    { key: 'back_gross', label: 'Back Gross' },
    { key: 'front_gross', label: 'Front Gross' },
  ]
  const current = OPTIONS.find(o => o.key === value) ?? OPTIONS[0]
  return (
    <div style={{ position: 'relative', width: 118, flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{
          width: '100%', height: 36, minHeight: 0, boxSizing: 'border-box', padding: '0 9px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
          borderRadius: 10, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.label}</span>
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M3 5l3 3 3-3" /></svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 90,
          background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 12px 32px -8px rgba(24,24,27,0.25)', padding: 4,
        }}>
          {OPTIONS.map(o => (
            <button key={o.key} onMouseDown={() => { onChange(o.key); setOpen(false) }} style={{
              width: '100%', textAlign: 'left', padding: '7px 9px', borderRadius: 7,
              border: 'none', minHeight: 0, cursor: 'pointer',
              background: o.key === value ? 'var(--bg-primary)' : 'transparent',
              fontSize: 12, fontWeight: o.key === value ? 700 : 500, color: 'var(--text-primary)',
            }}>{o.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Vehicle swap modal ───────────────────────────────────────────────

type VehicleHit = {
  id: string; stockNumber: string; year: number | null; make: string | null
  model: string | null; askingPrice?: number | null; heroUrl?: string | null; status?: string | null
}

function VehicleSwapModal({ currentVehicleId, onClose, onPick }: {
  currentVehicleId: string
  onClose: () => void
  onPick: (vehicleId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<VehicleHit[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ limit: '24' })
      if (query.trim()) qs.set('search', query.trim())
      fetch(`/api/inventory?${qs.toString()}`)
        .then(r => r.json())
        .then(d => { if (!cancelled) { setResults(d.vehicles || []); setLoading(false) } })
        .catch(() => { if (!cancelled) setLoading(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="mm-backdrop" onClick={onClose}>
      <div className="mm-panel" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, maxHeight: '76vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>Change vehicle</div>
            <button className="mm-close" onClick={onClose} style={{ border: 'none', cursor: 'pointer' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stock #, VIN, make, model…"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '9px 14px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--bg-primary)',
              fontSize: 13.5, fontWeight: 500, color: 'var(--text-primary)', outline: 'none',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#c4e050'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(223,253,110,0.2)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
          />
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8 }}>
            Picking a new car re-seeds the price from its asking price.
          </div>
        </div>

        <div style={{ overflowY: 'auto', padding: 8 }}>
          {loading ? (
            <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Searching…</div>
          ) : results.length === 0 ? (
            <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No vehicles found.</div>
          ) : results.map(v => {
            const disabled = v.id === currentVehicleId || v.status === 'sold'
            return (
              <button key={v.id} disabled={disabled} onClick={() => onPick(v.id)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: 8, borderRadius: 12, border: 'none', textAlign: 'left',
                background: 'transparent', cursor: disabled ? 'default' : 'pointer',
                opacity: disabled ? 0.45 : 1, transition: 'background 0.12s ease',
              }}
                onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--bg-primary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{
                  width: 64, height: 44, borderRadius: 8, flexShrink: 0,
                  background: v.heroUrl ? `center/cover no-repeat url(${v.heroUrl})` : 'var(--lane-bg)',
                  border: '1px solid var(--border-light)',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 640, letterSpacing: '-0.015em', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Stock #{v.stockNumber}
                    {v.id === currentVehicleId ? ' · current' : v.status === 'sold' ? ' · SOLD' : ''}
                  </div>
                </div>
                {v.askingPrice != null && (
                  <div style={{ fontSize: 13, fontWeight: 640, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', flexShrink: 0 }}>
                    {money0(v.askingPrice)}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Jacket field primitives ──────────────────────────────────────────
// Compact labeled inputs matching the trade-card rhythm: 10.5px label over
// a 34px input, commit-on-blur straight to the buyer's contact record.

// Field states (user-approved structure): FILLED = white pill, stronger
// border, semibold value. EMPTY = flat grey pill with an em-dash placeholder.
// Required fields carry a red asterisk. SSN masks at rest, reveals on focus.

// `active` (field hovered or focused) sweeps a lime highlighter across the
// label — you always know exactly which field you're in.
function FieldLabel({ label, required, active }: { label: string; required?: boolean; active?: boolean }) {
  return (
    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      <span style={{
        fontSize: 11.5, fontWeight: active ? 700 : 600, letterSpacing: '0.01em',
        color: active ? '#1a1a1a' : 'var(--text-secondary)',
        // Subtle whisper of grey behind the active field's name — clear
        // without shouting.
        background: active ? 'rgba(24,24,27,0.06)' : 'transparent',
        borderRadius: 4, padding: '1px 5px', margin: '-1px -5px',
        transition: 'background 0.18s ease, color 0.18s ease',
      }}>
        {label}{required && <span style={{ color: '#e11d48', marginLeft: 3 }}>*</span>}
      </span>
    </span>
  )
}

function pillStyle(opts: { filled: boolean; active: boolean; editable: boolean }): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 4,
    height: 36, boxSizing: 'border-box', padding: '0 11px',
    borderRadius: 9,
    border: opts.active
      ? '1px solid #c4e050'
      : opts.filled
        ? '1px solid #d4d4ce'
        : '1px solid var(--border)',
    background: !opts.editable
      ? 'var(--lane-bg)'
      : opts.active || opts.filled ? '#fff' : 'var(--bg-primary)',
    boxShadow: opts.active ? '0 0 0 3px rgba(223,253,110,0.2)' : 'none',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
  }
}

function JField({ label, value, onSave, editable, kind = 'text', flex = '1 1 130px', required }: {
  label: string
  value: string | number | null
  onSave: (v: string | number | null) => void
  editable: boolean
  kind?: 'text' | 'money' | 'int' | 'date' | 'ssn' | 'phone'
  flex?: string
  required?: boolean
}) {
  const display = (v: string | number | null): string => {
    if (v == null) return ''
    if (kind === 'date') return String(v).slice(0, 10)
    return String(v)
  }
  const [draft, setDraft] = useState(display(value))
  const [focused, setFocused] = useState(false)
  // Sync the draft only when the PROP actually changes (server data landed)
  // — never on blur. Resetting on blur made the field flash back to the
  // stale value during the save round-trip, which read as "it deleted my
  // typing". Now what you typed stays visible until the server confirms.
  const lastValue = useRef(value)
  useEffect(() => {
    if (lastValue.current !== value) {
      lastValue.current = value
      if (!focused) setDraft(display(value))
    }
  }, [value, focused]) // eslint-disable-line react-hooks/exhaustive-deps

  function commit() {
    setFocused(false)
    let out: string | number | null = draft.trim() || null
    if (kind === 'money') out = draft === '' ? null : (parseFloat(draft.replace(/[^0-9.]/g, '')) || 0)
    if (kind === 'int') out = draft === '' ? null : (parseInt(draft.replace(/\D/g, ''), 10) || 0)
    if (kind === 'ssn') out = draft.replace(/\D/g, '') || null
    if (display(value) !== (out == null ? '' : String(out)) ) onSave(out)
  }

  const filled = value != null && value !== ''
  // SSN shows masked dots at rest; the raw digits appear only while editing.
  const shown = kind === 'ssn' && !focused && filled ? '•••-••-••••' : draft

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, flex }}>
      <FieldLabel label={label} required={required} />
      <div style={pillStyle({ filled, active: focused, editable })}>
        {kind === 'money' && <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>$</span>}
        <input
          disabled={!editable}
          type={kind === 'date' ? 'date' : 'text'}
          inputMode={kind === 'money' || kind === 'int' || kind === 'ssn' ? 'decimal' : undefined}
          value={shown}
          placeholder={kind === 'money' ? '0.00' : kind === 'int' ? '0' : '—'}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => { setFocused(true); if (kind === 'ssn') setDraft(display(value)) }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          style={{
            flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 12.5, fontWeight: filled ? 600 : 500,
            color: filled ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontVariantNumeric: 'tabular-nums', padding: 0,
          }}
        />
      </div>
    </label>
  )
}

// Bordered sub-section with the legend sitting in the border and a
// filled-count chip on the right — the user-approved group structure.
function FieldGroup({ legend, filled, total, children }: {
  legend: string
  filled: number
  total: number
  children: React.ReactNode
}) {
  const done = filled >= total
  return (
    <div style={{
      position: 'relative',
      border: '1px solid var(--border)', borderRadius: 12,
      padding: '18px 16px 14px', marginTop: 16,
    }}>
      <span style={{
        position: 'absolute', top: -8, left: 14,
        background: 'var(--bg-card)', padding: '0 8px',
        fontSize: 10.5, fontWeight: 700, color: 'var(--text-secondary)',
        textTransform: 'uppercase', letterSpacing: '0.09em',
      }}>{legend}</span>
      <span style={{
        position: 'absolute', top: -8, right: 14,
        background: 'var(--bg-card)', padding: '0 8px',
        fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em',
        color: 'var(--text-muted)',
      }}>
        <span style={{ color: done ? '#16a34a' : '#d97706' }}>{filled}</span>/{total} COMPLETE
      </span>
      {children}
    </div>
  )
}

const countFilled = (vals: Array<string | number | null>) =>
  vals.filter(v => v != null && v !== '').length

// 12-column layout primitives — every section shares the same proportioned
// grid (like the Vehicle card), so field rows line up page-wide.
function Grid12({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 12, ...style }}>{children}</div>
}
function Cell({ span, children }: { span: number; children: React.ReactNode }) {
  return <div style={{ gridColumn: `span ${span}`, minWidth: 0 }}>{children}</div>
}

function JSelect({ label, value, options, onSave, editable, flex = '1 1 130px', required }: {
  label: string
  value: string | null
  options: string[]
  onSave: (v: string | null) => void
  editable: boolean
  flex?: string
  required?: boolean
}) {
  const [open, setOpen] = useState(false)
  const filled = Boolean(value)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, flex, position: 'relative' }}>
      <FieldLabel label={label} required={required} />
      <button
        disabled={!editable}
        onClick={() => setOpen(o => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{
          ...pillStyle({ filled, active: open, editable }),
          justifyContent: 'space-between', gap: 6, minHeight: 0,
          cursor: editable ? 'pointer' : 'default',
        }}
      >
        <span style={{
          fontSize: 12.5, fontWeight: filled ? 600 : 500,
          color: filled ? 'var(--text-primary)' : 'var(--text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{value || 'Select'}</span>
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M3 5l3 3 3-3" />
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 40,
          background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 12px 32px -8px rgba(24,24,27,0.25)', padding: 4,
          maxHeight: 200, overflowY: 'auto',
        }}>
          {value && (
            <button onMouseDown={() => { onSave(null); setOpen(false) }} style={{
              width: '100%', textAlign: 'left', padding: '6px 9px', borderRadius: 7, border: 'none', minHeight: 0,
              background: 'transparent', fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', cursor: 'pointer',
            }}>— Clear —</button>
          )}
          {options.map(o => (
            <button key={o} onMouseDown={() => { onSave(o); setOpen(false) }} style={{
              width: '100%', textAlign: 'left', padding: '6px 9px', borderRadius: 7, border: 'none', minHeight: 0,
              background: o === value ? 'rgba(223,253,110,0.25)' : 'transparent',
              fontSize: 12.5, fontWeight: o === value ? 700 : 500,
              color: 'var(--text-primary)', cursor: 'pointer',
            }}
              onMouseEnter={(e) => { if (o !== value) e.currentTarget.style.background = 'var(--bg-primary)' }}
              onMouseLeave={(e) => { if (o !== value) e.currentTarget.style.background = 'transparent' }}
            >{o}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Applicant Info section ───────────────────────────────────────────

function ApplicantCard({ buyer, editable, onSave }: {
  buyer: Buyer
  editable: boolean
  onSave: (fields: Record<string, unknown>) => void
}) {
  const [showPrev, setShowPrev] = useState(
    Boolean(buyer.prevStreet || buyer.prevCity || buyer.prevZip)
  )
  const f = (key: keyof Buyer) => (v: string | number | null) => onSave({ [key]: v })

  return (
    <div style={{ ...card, padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <SectionHeader
          tint="rgba(37,99,235,0.10)"
          tile={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>}
          title="Applicant Info"
          sub="Edits save to the customer record"
        />
        {/* Selected-customer chip — click through to their profile. */}
        <Link
          href={`/customers/${buyer.id}`}
          title="Open customer profile"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '5px 12px 5px 6px', minHeight: 0, borderRadius: 100,
            border: '1px solid var(--border)', background: 'var(--bg-primary)',
            textDecoration: 'none', boxShadow: 'var(--shadow-sm)',
            transition: 'border-color 0.12s ease, background 0.12s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#c4e050'; e.currentTarget.style.background = '#fff' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-primary)' }}
        >
          <span style={{
            width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
            background: '#1a1a1a', color: 'var(--accent)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700,
          }}>{buyer.firstName.charAt(0)}{buyer.lastName.charAt(0)}</span>
          <span style={{
            fontSize: 12.5, fontWeight: 640, letterSpacing: '-0.01em', color: 'var(--text-primary)',
            maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{buyer.firstName} {buyer.lastName}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M7 17 17 7M9 7h8v8" />
          </svg>
        </Link>
      </div>

      {/* Identity */}
      <FieldGroup
        legend="Identity"
        filled={countFilled([buyer.salutation, buyer.firstName, buyer.middleName, buyer.lastName, buyer.nameSuffix, buyer.nickname, buyer.ssn, buyer.dateOfBirth, buyer.gender])}
        total={9}
      >
        <Grid12>
          <Cell span={2}><JSelect label="Salutation" value={buyer.salutation} options={SALUTATIONS} onSave={f('salutation')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={4}><JField label="First Name" required value={buyer.firstName} onSave={(v) => v && onSave({ firstName: v })} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={3}><JField label="Middle Name" value={buyer.middleName} onSave={f('middleName')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={3}><JField label="Last Name" required value={buyer.lastName} onSave={(v) => v && onSave({ lastName: v })} editable={editable} flex="1 1 auto" /></Cell>

          <Cell span={2}><JSelect label="Suffix" value={buyer.nameSuffix} options={SUFFIXES} onSave={f('nameSuffix')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={2}><JField label="Nickname" value={buyer.nickname} onSave={f('nickname')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={3}><JField label="SSN / ITIN" value={buyer.ssn} onSave={f('ssn')} editable={editable} kind="ssn" flex="1 1 auto" /></Cell>
          <Cell span={3}><JField label="Date of Birth" required value={buyer.dateOfBirth} onSave={f('dateOfBirth')} editable={editable} kind="date" flex="1 1 auto" /></Cell>
          <Cell span={2}><JSelect label="Gender" value={buyer.gender} options={GENDERS} onSave={f('gender')} editable={editable} flex="1 1 auto" /></Cell>
        </Grid12>
      </FieldGroup>

      {/* ID document */}
      <FieldGroup
        legend="ID Document"
        filled={countFilled([buyer.idType, buyer.idState, buyer.idNo, buyer.idIssuedDate, buyer.idExpirationDate])}
        total={5}
      >
        <Grid12>
          <Cell span={3}><JSelect label="ID Type" required value={buyer.idType} options={ID_TYPES} onSave={f('idType')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={2}><JField label="ID State" required value={buyer.idState} onSave={f('idState')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={3}><JField label="ID Number" required value={buyer.idNo} onSave={f('idNo')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={2}><JField label="Issued" value={buyer.idIssuedDate} onSave={f('idIssuedDate')} editable={editable} kind="date" flex="1 1 auto" /></Cell>
          <Cell span={2}><JField label="Expires" value={buyer.idExpirationDate} onSave={f('idExpirationDate')} editable={editable} kind="date" flex="1 1 auto" /></Cell>
        </Grid12>
      </FieldGroup>

      {/* Residence */}
      <FieldGroup
        legend="Residence"
        filled={countFilled([buyer.address, buyer.city, buyer.state, buyer.zip, buyer.county, buyer.residenceType, buyer.rentMortgage, buyer.lengthAtAddressYears])}
        total={8}
      >
        <Grid12>
          <Cell span={5}><JField label="Street" required value={buyer.address} onSave={f('address')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={3}><JField label="City" required value={buyer.city} onSave={f('city')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={1}><JField label="State" required value={buyer.state} onSave={f('state')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={1}><JField label="Zip" value={buyer.zip} onSave={f('zip')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={2}><JField label="County" required value={buyer.county} onSave={f('county')} editable={editable} flex="1 1 auto" /></Cell>

          <Cell span={3}><JSelect label="Residence Type" value={buyer.residenceType} options={RESIDENCE_TYPES} onSave={f('residenceType')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={3}><JField label="Rent / Mortgage (mo)" value={buyer.rentMortgage} onSave={f('rentMortgage')} editable={editable} kind="money" flex="1 1 auto" /></Cell>
          <Cell span={2}><JField label="Years at Addr." value={buyer.lengthAtAddressYears} onSave={f('lengthAtAddressYears')} editable={editable} kind="int" flex="1 1 auto" /></Cell>
          <Cell span={2}><JField label="Months" value={buyer.lengthAtAddressMonths} onSave={f('lengthAtAddressMonths')} editable={editable} kind="int" flex="1 1 auto" /></Cell>
          <Cell span={2}>
            <div style={{ display: 'flex', alignItems: 'flex-end', height: '100%' }}>
              <button onClick={() => setShowPrev(s => !s)} style={{
                width: '100%', height: 36, padding: '0 10px', minHeight: 0, borderRadius: 9,
                border: '1px dashed var(--border)', background: 'transparent',
                fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{showPrev ? 'Hide previous' : '+ Previous addr.'}</button>
            </div>
          </Cell>
        </Grid12>
      </FieldGroup>

      {showPrev && (
        <FieldGroup
          legend="Previous Address"
          filled={countFilled([buyer.prevStreet, buyer.prevCity, buyer.prevState, buyer.prevZip, buyer.prevCounty, buyer.prevResidenceType, buyer.prevRentMortgage, buyer.prevLengthYears])}
          total={8}
        >
          <Grid12>
            <Cell span={5}><JField label="Street" value={buyer.prevStreet} onSave={f('prevStreet')} editable={editable} flex="1 1 auto" /></Cell>
            <Cell span={3}><JField label="City" value={buyer.prevCity} onSave={f('prevCity')} editable={editable} flex="1 1 auto" /></Cell>
            <Cell span={1}><JField label="State" value={buyer.prevState} onSave={f('prevState')} editable={editable} flex="1 1 auto" /></Cell>
            <Cell span={1}><JField label="Zip" value={buyer.prevZip} onSave={f('prevZip')} editable={editable} flex="1 1 auto" /></Cell>
            <Cell span={2}><JField label="County" value={buyer.prevCounty} onSave={f('prevCounty')} editable={editable} flex="1 1 auto" /></Cell>

            <Cell span={3}><JSelect label="Residence Type" value={buyer.prevResidenceType} options={RESIDENCE_TYPES} onSave={f('prevResidenceType')} editable={editable} flex="1 1 auto" /></Cell>
            <Cell span={3}><JField label="Rent / Mortgage (mo)" value={buyer.prevRentMortgage} onSave={f('prevRentMortgage')} editable={editable} kind="money" flex="1 1 auto" /></Cell>
            <Cell span={2}><JField label="Years" value={buyer.prevLengthYears} onSave={f('prevLengthYears')} editable={editable} kind="int" flex="1 1 auto" /></Cell>
            <Cell span={2}><JField label="Months" value={buyer.prevLengthMonths} onSave={f('prevLengthMonths')} editable={editable} kind="int" flex="1 1 auto" /></Cell>
          </Grid12>
        </FieldGroup>
      )}

      {/* Contact */}
      <FieldGroup
        legend="Contact"
        filled={countFilled([buyer.phone, buyer.homePhone, buyer.workPhone, buyer.email])}
        total={4}
      >
        <Grid12>
          <Cell span={3}><JField label="Cell Phone" required value={buyer.phone} onSave={f('phone')} editable={editable} kind="phone" flex="1 1 auto" /></Cell>
          <Cell span={3}><JField label="Home Phone" value={buyer.homePhone} onSave={f('homePhone')} editable={editable} kind="phone" flex="1 1 auto" /></Cell>
          <Cell span={3}><JField label="Work Phone" value={buyer.workPhone} onSave={f('workPhone')} editable={editable} kind="phone" flex="1 1 auto" /></Cell>
          <Cell span={3}><JField label="Email" value={buyer.email} onSave={f('email')} editable={editable} flex="1 1 auto" /></Cell>
        </Grid12>
      </FieldGroup>
    </div>
  )
}

// ─── Employment section (two blocks, DC parity) ───────────────────────

function EmploymentCard({ buyer, editable, onSave }: {
  buyer: Buyer
  editable: boolean
  onSave: (fields: Record<string, unknown>) => void
}) {
  const f = (key: keyof Buyer) => (v: string | number | null) => onSave({ [key]: v })

  // Employment is add-on-demand: hidden behind a pill unless the record
  // already carries employment data (e.g. filled during a credit app),
  // in which case it auto-expands. Second block works the same way.
  const hasEmp1 = Boolean(buyer.employmentType || buyer.employerName || buyer.employerPhone || buyer.employerAddress || buyer.employerYears || buyer.incomeType || buyer.employerMonthlyIncome)
  const hasEmp2 = Boolean(buyer.employment2Type || buyer.employer2Name || buyer.employer2Phone || buyer.employer2Years || buyer.income2Type || buyer.employer2MonthlyIncome)
  const [open, setOpen] = useState(hasEmp1 || hasEmp2)
  const [showSecond, setShowSecond] = useState(hasEmp2)
  useEffect(() => {
    if (hasEmp1 || hasEmp2) setOpen(true)
    if (hasEmp2) setShowSecond(true)
  }, [hasEmp1, hasEmp2])

  const addPill = (label: string, onClick: () => void) => (
    <button onClick={onClick} style={{
      alignSelf: 'flex-start', padding: '8px 14px', minHeight: 0, borderRadius: 100,
      border: '1.5px dashed var(--border)', background: 'transparent',
      fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer',
      transition: 'border-color 0.12s ease, color 0.12s ease',
    }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#c4e050'; e.currentTarget.style.color = 'var(--text-primary)' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
    >{label}</button>
  )

  if (!open) {
    return (
      <div style={{ ...card, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <SectionHeader
            tint="rgba(139,92,246,0.10)"
            tile={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>}
            title="Employment"
            sub={hasEmp1 || hasEmp2 ? `${buyer.employerName || 'Employment'} on file — hidden` : 'None on file — add only if the deal needs it'}
          />
          {(editable || hasEmp1 || hasEmp2) && addPill(hasEmp1 || hasEmp2 ? 'Show employment' : '+ Add employment info', () => setOpen(true))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...card, padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <SectionHeader
          tint="rgba(139,92,246,0.10)"
          tile={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>}
          title="Employment"
          sub={hasEmp1 || hasEmp2 ? 'On file — edits save to the customer record' : 'Fill what applies'}
        />
        <CollapseBtn onClick={() => setOpen(false)} />
      </div>

      <FieldGroup
        legend="Employment 1"
        filled={countFilled([buyer.employmentType, buyer.employerName, buyer.employerPhone, buyer.employerAddress, buyer.employerYears, buyer.incomeType, buyer.employerMonthlyIncome])}
        total={7}
      >
        <Grid12>
          <Cell span={3}><JSelect label="Employment Type" value={buyer.employmentType} options={EMPLOYMENT_TYPES} onSave={f('employmentType')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={4}><JField label="Employer Name" value={buyer.employerName} onSave={f('employerName')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={3}><JField label="Employer Phone" value={buyer.employerPhone} onSave={f('employerPhone')} editable={editable} kind="phone" flex="1 1 auto" /></Cell>
          <Cell span={1}><JField label="Years" value={buyer.employerYears} onSave={f('employerYears')} editable={editable} kind="int" flex="1 1 auto" /></Cell>
          <Cell span={1}><JField label="Months" value={buyer.employerMonths} onSave={f('employerMonths')} editable={editable} kind="int" flex="1 1 auto" /></Cell>

          <Cell span={3}><JSelect label="Income Type" value={buyer.incomeType} options={INCOME_TYPES} onSave={f('incomeType')} editable={editable} flex="1 1 auto" /></Cell>
          <Cell span={3}><JField label="Income (Monthly)" value={buyer.employerMonthlyIncome} onSave={f('employerMonthlyIncome')} editable={editable} kind="money" flex="1 1 auto" /></Cell>
          <Cell span={6}><JField label="Employer Address" value={buyer.employerAddress} onSave={f('employerAddress')} editable={editable} flex="1 1 auto" /></Cell>
        </Grid12>
      </FieldGroup>

      {showSecond ? (
        <FieldGroup
          legend="Employment 2"
          filled={countFilled([buyer.employment2Type, buyer.employer2Name, buyer.employer2Phone, buyer.employer2Years, buyer.income2Type, buyer.employer2MonthlyIncome])}
          total={6}
        >
          <Grid12>
            <Cell span={3}><JSelect label="Employment Type" value={buyer.employment2Type} options={EMPLOYMENT_TYPES} onSave={f('employment2Type')} editable={editable} flex="1 1 auto" /></Cell>
            <Cell span={4}><JField label="Employer Name" value={buyer.employer2Name} onSave={f('employer2Name')} editable={editable} flex="1 1 auto" /></Cell>
            <Cell span={3}><JField label="Employer Phone" value={buyer.employer2Phone} onSave={f('employer2Phone')} editable={editable} kind="phone" flex="1 1 auto" /></Cell>
            <Cell span={1}><JField label="Years" value={buyer.employer2Years} onSave={f('employer2Years')} editable={editable} kind="int" flex="1 1 auto" /></Cell>
            <Cell span={1}><JField label="Months" value={buyer.employer2Months} onSave={f('employer2Months')} editable={editable} kind="int" flex="1 1 auto" /></Cell>

            <Cell span={3}><JSelect label="Income Type" value={buyer.income2Type} options={INCOME_TYPES} onSave={f('income2Type')} editable={editable} flex="1 1 auto" /></Cell>
            <Cell span={3}><JField label="Income (Monthly)" value={buyer.employer2MonthlyIncome} onSave={f('employer2MonthlyIncome')} editable={editable} kind="money" flex="1 1 auto" /></Cell>
          </Grid12>
        </FieldGroup>
      ) : editable && (
        <div style={{ marginTop: 14 }}>
          {addPill('+ Second employment', () => setShowSecond(true))}
        </div>
      )}
    </div>
  )
}

// ─── Co-Buyer section ─────────────────────────────────────────────────

type ContactHit = { id: string; firstName: string; lastName: string; phone: string | null; email: string | null }

function CoBuyerSection({ coBuyer, relationship, editable, onAttach, onDetach, onRelationship }: {
  coBuyer: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null } | null
  relationship: string | null
  editable: boolean
  onAttach: (contactId: string) => void
  onDetach: () => void
  onRelationship: (v: string | null) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ContactHit[]>([])
  const [open, setOpen] = useState(false)
  // Section is add-on-demand like Employment: slim header + pill until a
  // co-buyer is attached or the user opens the search.
  const [expanded, setExpanded] = useState(Boolean(coBuyer))
  // Depend on the id, not the object — the deal payload refreshes on every
  // save and would otherwise force the section back open each time.
  const coBuyerId = coBuyer?.id ?? null
  useEffect(() => { if (coBuyerId) setExpanded(true) }, [coBuyerId])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ limit: '15' })
        if (query.trim()) params.set('search', query.trim())
        const r = await fetch(`/api/contacts?${params}`)
        const d = await r.json()
        setResults(Array.isArray(d?.contacts) ? d.contacts : [])
      } catch { setResults([]) }
    }, 200)
    return () => clearTimeout(t)
  }, [query, open])

  const header = (
    <SectionHeader
      tint="rgba(22,163,74,0.10)"
      tile={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
      title="Co-Buyer"
      sub={coBuyer ? 'Second person on the deal' : 'None — add only if there is one'}
    />
  )

  if (!expanded) {
    return (
      <div style={{ ...card, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <SectionHeader
            tint="rgba(22,163,74,0.10)"
            tile={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
            title="Co-Buyer"
            sub={coBuyer ? `${coBuyer.firstName} ${coBuyer.lastName}${relationship ? ` · ${relationship}` : ''} — hidden` : 'None — add only if there is one'}
          />
          {(editable || coBuyer) && (
            <button onClick={() => setExpanded(true)} style={{
              padding: '8px 14px', minHeight: 0, borderRadius: 100,
              border: '1.5px dashed var(--border)', background: 'transparent',
              fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer',
              transition: 'border-color 0.12s ease, color 0.12s ease',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#c4e050'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
            >{coBuyer ? 'Show co-buyer' : '+ Add Co-Buyer'}</button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...card, padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        {header}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          {coBuyer && (
            <div style={{ width: 180 }}>
              <JSelect label="Relationship" value={relationship} options={RELATIONSHIPS} onSave={onRelationship} editable={editable} flex="1 1 auto" />
            </div>
          )}
          <CollapseBtn onClick={() => setExpanded(false)} />
        </div>
      </div>

      {coBuyer ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 11,
          border: '1px solid var(--border)', borderRadius: 12,
          background: 'var(--bg-primary)', padding: '11px 14px',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: '#1a1a1a', color: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11.5, fontWeight: 700,
          }}>{coBuyer.firstName.charAt(0)}{coBuyer.lastName.charAt(0)}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Link href={`/customers/${coBuyer.id}`} style={{
              fontSize: 13.5, fontWeight: 640, letterSpacing: '-0.015em',
              color: 'var(--text-primary)', textDecoration: 'none', minHeight: 0,
            }}>{coBuyer.firstName} {coBuyer.lastName}</Link>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[coBuyer.phone, coBuyer.email?.toLowerCase()].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
          {editable && (
            <button onClick={onDetach} title="Detach co-buyer" style={{
              width: 24, height: 24, minHeight: 0, borderRadius: 7, border: 'none', padding: 0, flexShrink: 0,
              background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.12s ease, color 0.12s ease',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.10)'; e.currentTarget.style.color = '#ef4444' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      ) : editable ? (
        <div style={{ position: 'relative', maxWidth: 420 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 180)}
            placeholder="Search customers to attach…"
            style={{
              width: '100%', boxSizing: 'border-box', height: 36, padding: '0 12px',
              borderRadius: 10, border: '1px solid var(--border)', background: '#fff',
              fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', outline: 'none',
            }}
          />
          {open && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 40,
              background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
              boxShadow: '0 12px 32px -8px rgba(24,24,27,0.25)', padding: 4,
              maxHeight: 220, overflowY: 'auto',
            }}>
              {results.length === 0 ? (
                <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                  {query.trim() ? 'No matches.' : 'Start typing to search…'}
                </div>
              ) : results.map(c => (
                <button key={c.id} onMouseDown={() => { onAttach(c.id); setQuery('') }} style={{
                  width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 7,
                  border: 'none', minHeight: 0, background: 'transparent', cursor: 'pointer',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-primary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{c.firstName} {c.lastName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    {[c.phone, c.email].filter(Boolean).join(' · ') || '—'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No co-buyer on this deal.</div>
      )}
    </div>
  )
}
