'use client'

// ─── Deal Contract page (DC parity) — the deal's home after Proceed ───
// Header chips → tab rail → [action rail | Structure + LienHolder + Notes
// | Deal Summary]. Structure is editable here (price, cash received,
// financing terms) like DealerCenter; itemized categories still edit on
// the worksheet. The summary computes financing (amortized) and the full
// profit waterfall from real cost data. Money-gated server-side.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  computeDealTotals, computeFinancing, computeDealProfit, formatDealNumber,
  LINE_ITEM_CATEGORIES, type DealTotals,
} from '@/lib/deals'

type FinalizeDeal = {
  id: string
  dealNumber: number
  status: string
  dealType: string
  salePrice: number
  collectTax: boolean
  stateTaxRate: number
  countySurtaxRate: number
  surtaxCap: number
  depositCredit: number
  termMonths: number | null
  apr: number | null
  firstPaymentDays: number
  commissions: number
  notes: string | null
  proceededAt: string | null
  fundedAt: string | null
  createdAt: string
  vehicle: {
    id: string; stockNumber: string; vin: string | null; year: number | null
    make: string | null; model: string | null; mileage: number | null
    askingPrice: number | null; inventoryStatus: string | null
    vehicleCost: number | null
    costAdds: Array<{ amountCents: number }>
    trim: string | null
  }
  buyer: {
    id: string; firstName: string; lastName: string; phone: string | null
    dateOfBirth: string | null; idType: string | null; idState: string | null; idNo: string | null
    address: string | null; city: string | null; state: string | null; county: string | null
  } | null
  businessBuyer: { id: string; businessName: string; enterpriseType: string | null; street: string | null; city: string | null; state: string | null; zip: string | null; phone: string | null } | null
  coBuyer: { id: string; firstName: string; lastName: string } | null
  salesRep: { id: string; name: string } | null
  lienholderPartner: { id: string; companyName: string } | null
  lineItems: Array<{ category: string; label: string; amount: number; taxable: boolean; cost: number | null }>
  trades: Array<{ allowance: number; acv: number; payoff: number; year: number | null; make: string | null; model: string | null }>
}

// ── Recon design tokens ──
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

const TABS = [
  { key: 'contract', label: 'Deal Contract' },
  { key: 'worksheet', label: 'Worksheet' },
  { key: 'notes', label: 'Notes' },
  { key: 'lender', label: 'Lender Offers', disabled: true },
  { key: 'compare', label: 'Compare Offers', disabled: true },
  { key: 'journal', label: 'Journal Entries', disabled: true },
  { key: 'files', label: 'Files', disabled: true },
  { key: 'events', label: 'Events', disabled: true },
] as const

export default function DealContractPage() {
  const params = useParams()
  const router = useRouter()
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string)

  const [deal, setDeal] = useState<FinalizeDeal | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<null | { title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void }>(null)
  const notesRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await fetch(`/api/deals/${id}`).then(r => r.json())
      setDeal(d.deal || null)
    } finally {
      setLoading(false)
    }
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
      if (!res.ok) { setError(d.error || 'Save failed'); return }
      setDeal(d.deal)
    } catch {
      setError('Connection problem — your last change may not have saved.')
      try {
        const fresh = await fetch(`/api/deals/${id}`).then(r => r.json())
        if (fresh.deal) setDeal(fresh.deal)
      } catch { /* offline — banner stands */ }
    } finally {
      setSaving(false)
    }
  }, [id])

  async function fund() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/deals/${id}/fund`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Funding failed'); return }
      await load()
    } catch {
      setError('Connection problem — funding may not have completed. Refresh to verify.')
    } finally {
      setSaving(false)
    }
  }

  async function cancelDeal() {
    setSaving(true)
    try {
      const res = await fetch(`/api/deals/${id}`, { method: 'DELETE' })
      if (res.ok) await load()
      else setError((await res.json().catch(() => ({}))).error || 'Could not cancel')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !deal) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
  }

  const isWholesale = deal.dealType === 'wholesale'
  const editable = deal.status === 'draft'
  const totals: DealTotals = computeDealTotals(deal)
  const financing = computeFinancing({ amountFinanced: totals.balanceDue, apr: deal.apr, termMonths: deal.termMonths })

  // ── Profit waterfall from real cost data ──
  const costAddsTotal = deal.vehicle.costAdds.reduce((s, c) => s + c.amountCents, 0) / 100
  const trueCost = deal.vehicle.vehicleCost != null ? deal.vehicle.vehicleCost + costAddsTotal : null
  const overAllowance = deal.trades.reduce((s, t) => s + Math.max(0, (t.allowance || 0) - (t.acv || t.allowance || 0)), 0)
  const profit = computeDealProfit({
    salePrice: deal.salePrice, trueCost, overAllowance,
    lineItems: deal.lineItems, commissions: deal.commissions,
  })

  // ── Readiness (mirrors the jacket snapshot) ──
  const b = deal.buyer
  const blockers: string[] = []
  if (!(deal.salePrice > 0)) blockers.push('sale price')
  if (isWholesale) {
    if (!deal.businessBuyer) blockers.push('business buyer')
    else {
      const bz = deal.businessBuyer
      const miss = [bz.businessName, bz.enterpriseType, bz.street, bz.city, bz.state, bz.zip].filter(x => !x).length
      if (miss) blockers.push(`${miss} business field${miss > 1 ? 's' : ''}`)
    }
  } else if (!b) blockers.push('a buyer')
  else {
    const miss = [b.firstName, b.lastName, b.dateOfBirth, b.idType, b.idState, b.idNo, b.address, b.city, b.state, b.county, b.phone].filter(x => !x).length
    if (miss) blockers.push(`${miss} applicant field${miss > 1 ? 's' : ''}`)
  }
  const v = deal.vehicle
  const vMiss = [v.vin, v.year, v.make, v.model, v.trim, v.mileage].filter(x => x == null || x === '').length
  if (vMiss) blockers.push(`${vMiss} vehicle field${vMiss > 1 ? 's' : ''}`)
  const ready = blockers.length === 0

  const buyerName = deal.buyer
    ? `${deal.buyer.firstName} ${deal.buyer.lastName}`
    : deal.businessBuyer?.businessName ?? '—'

  const catTotal = (key: string) =>
    deal.lineItems.filter(i => i.category === key).reduce((s, i) => s + (i.amount || 0), 0)

  const firstPaymentDate = new Date(Date.now() + deal.firstPaymentDays * 86400000)

  return (
    <div style={{ maxWidth: 1340, margin: '0 auto' }}>
      {/* ══ Header band: identity chips ══ */}
      <div style={{
        ...card, padding: '12px 16px', marginBottom: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', minWidth: 0 }}>
          {/* Vehicle */}
          <Link href={`/vehicles/${deal.vehicle.id}`} style={{ textDecoration: 'none', minHeight: 0, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 640, letterSpacing: '-0.01em', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              {[deal.vehicle.year, deal.vehicle.make, deal.vehicle.model].filter(Boolean).join(' ')}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              Stock #{deal.vehicle.stockNumber}{deal.vehicle.vin ? ` · ${deal.vehicle.vin.slice(-8)}` : ''}
            </div>
          </Link>

          <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-light)' }} />

          {/* Buyer + compliance badges (Phase 6 lights these up) */}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Link
                href={deal.buyer ? `/customers/${deal.buyer.id}` : `/deals/${deal.id}`}
                style={{ fontSize: 13.5, fontWeight: 640, letterSpacing: '-0.01em', color: 'var(--text-primary)', textDecoration: 'none', minHeight: 0, whiteSpace: 'nowrap' }}
              >{buyerName}</Link>
              {!isWholesale && ['Pre-Qual', 'Credit', 'Turbo'].map(bdg => (
                <span key={bdg} title={`${bdg} — credit integration (Phase 6)`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)',
                }}>
                  <span style={{
                    width: 15, height: 15, borderRadius: '50%', display: 'inline-flex',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'var(--bg-primary)', border: '1px solid var(--border)',
                    fontSize: 6.5, fontWeight: 700, color: 'var(--text-muted)',
                  }}>N/A</span>
                  {bdg}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>
              {isWholesale
                ? `Business buyer${deal.businessBuyer?.phone ? ` · ${deal.businessBuyer.phone}` : ''}`
                : deal.buyer?.phone || 'Buyer'}
              {!isWholesale && (
                deal.coBuyer
                  ? <> · Co-buyer: {deal.coBuyer.firstName} {deal.coBuyer.lastName}</>
                  : <> · <Link href={`/deals/${deal.id}`} style={{ color: 'var(--text-muted)', minHeight: 0 }}>Add Co-Buyer</Link></>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {saving && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Saving…</span>}
          <span style={{
            fontSize: 11.5, fontWeight: 600, padding: '4px 12px', borderRadius: 100,
            background: deal.status === 'funded' ? '#edfaf0' : deal.status === 'cancelled' ? '#fdecef' : '#fdf3e7',
            color: deal.status === 'funded' ? '#16a34a' : deal.status === 'cancelled' ? '#e11d48' : '#d97706',
          }}>{deal.status === 'funded' ? 'Funded' : deal.status === 'cancelled' ? 'Cancelled' : 'Pending — Working Deal'}</span>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)' }}>
              Deal Type: {isWholesale ? 'Wholesale' : 'Retail · Cash'}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {formatDealNumber(deal.dealNumber)} · {new Date(deal.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>
      </div>

      {/* ══ Tab rail ══ */}
      <div style={{
        display: 'flex', gap: 2, padding: 4, marginBottom: 16,
        background: 'var(--bg-primary)', borderRadius: 12, overflowX: 'auto',
      }}>
        {TABS.map(t => {
          const active = t.key === 'contract'
          const disabled = 'disabled' in t && t.disabled
          return (
            <button
              key={t.key}
              disabled={disabled}
              title={disabled ? 'Coming in a later phase' : undefined}
              onClick={() => {
                if (t.key === 'worksheet') router.push(`/deals/${deal.id}`)
                if (t.key === 'notes') notesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }}
              style={{
                flex: '1 0 auto', padding: '7px 14px', borderRadius: 9, border: 'none', minHeight: 0,
                background: active ? 'var(--bg-card)' : 'transparent',
                color: active ? 'var(--text-primary)' : disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
                fontSize: 12.5, fontWeight: active ? 700 : 600, whiteSpace: 'nowrap',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.55 : 1,
                boxShadow: active ? '0 1px 3px rgba(24,24,27,0.10)' : 'none',
              }}
            >{t.label}</button>
          )
        })}
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

      <div style={{ display: 'grid', gridTemplateColumns: '185px minmax(0, 1fr) 340px', gap: 16, alignItems: 'start' }}>
        {/* ══ Action rail ══ */}
        <div style={{ ...card, padding: 8, position: 'sticky', top: 16 }}>
          <RailBtn label="Edit Worksheet" onClick={() => router.push(`/deals/${deal.id}`)} />
          {!isWholesale && deal.buyer && <RailBtn label="Customer View" onClick={() => router.push(`/customers/${deal.buyer!.id}`)} />}
          <RailBtn label="Print" disabled hint="Documents — Phase 5" />
          <RailBtn label="Payments" disabled hint="Coming soon" />
          <RailBtn label="Stipulations" disabled hint="Coming soon" />
          <RailBtn label="Lender Fees" disabled hint="Outside financing" />
          {editable && (
            <>
              <div style={{ height: 1, background: 'var(--border-light)', margin: '6px 4px' }} />
              <RailBtn
                label="Cancel Deal"
                danger
                onClick={() => setConfirm({
                  title: 'Cancel this deal?',
                  body: 'The worksheet is kept for reference, but the deal closes and can no longer be edited or funded.',
                  confirmLabel: 'Cancel Deal',
                  danger: true,
                  onConfirm: cancelDeal,
                })}
              />
            </>
          )}
        </div>

        {/* ══ Main: Structure + LienHolder + Notes ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {/* Structure */}
          <div style={{ ...card, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>Structure</span>
              <button disabled title="Solve price from a target payment — coming with outside financing" style={{
                padding: '5px 12px', borderRadius: 8, minHeight: 0,
                border: '1px dashed var(--border)', background: 'transparent',
                fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', cursor: 'not-allowed',
              }}>Roll Back</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '0 28px' }}>
              {/* Left: money structure */}
              <div>
                <SLine sign="+" label="Price" strong
                  right={<FMoney value={deal.salePrice} editable={editable} onSave={(n) => patch({ salePrice: n })} />} />
                {LINE_ITEM_CATEGORIES.map(c => (
                  <SLine key={c.key} sign="+" label={c.label}
                    right={
                      <button
                        onClick={() => router.push(`/deals/${deal.id}`)}
                        title="Itemize on the worksheet"
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                          width: 140, height: 34, boxSizing: 'border-box', padding: '0 8px 0 11px',
                          borderRadius: 9, border: '1px solid var(--border-light)', background: 'var(--bg-primary)',
                          cursor: 'pointer', minHeight: 0,
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                          {money(catTotal(c.key))}
                        </span>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                          <circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" />
                        </svg>
                      </button>
                    } />
                ))}
                <SLine sign="+" label={isWholesale ? 'Total Tax (wholesale)' : deal.collectTax ? `Total Tax (${((deal.stateTaxRate + deal.countySurtaxRate) * 100).toFixed(1)}% FL)` : 'Total Tax (out-of-state)'}
                  right={<LockedBox amount={totals.taxAmount} />} />
                <SLine sign="−" label="Cash Received"
                  right={<FMoney value={deal.depositCredit} editable={editable} onSave={(n) => patch({ depositCredit: n })} />} />
                <SLine sign="−" label="Trade In"
                  right={<LockedBox amount={totals.netTradeEquity} />} />
                <div style={{ borderTop: '1px solid var(--border-light)', marginTop: 8, paddingTop: 8 }}>
                  <SLine sign="=" label="Amount Financed" strong
                    right={<LockedBox amount={totals.balanceDue} strong />} />
                </div>
              </div>

              {/* Right: financing terms */}
              <div>
                <SLine sign=" " label="Term"
                  right={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FInt value={deal.termMonths} editable={editable} width={64} onSave={(n) => patch({ termMonths: n })} />
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>months</span>
                    </div>
                  } />
                <SLine sign=" " label="Interest Rate"
                  right={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FMoney value={deal.apr ?? 0} editable={editable} width={80} noDollar onSave={(n) => patch({ apr: n })} />
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>% APR</span>
                    </div>
                  } />
                <SLine sign=" " label="Monthly Payment"
                  right={<LockedBox amount={financing.monthlyPayment} />} />
                <SLine sign=" " label="First Payment"
                  right={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FInt value={deal.firstPaymentDays} editable={editable} width={54} onSave={(n) => patch({ firstPaymentDays: n ?? 30 })} />
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>days · {firstPaymentDate.toLocaleDateString()}</span>
                    </div>
                  } />
                <div style={{
                  marginTop: 12, padding: '9px 12px', borderRadius: 9,
                  background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
                  fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5,
                }}>
                  {totals.balanceDue <= 0
                    ? 'Cash deal — nothing left to finance.'
                    : deal.termMonths
                      ? `${money(financing.monthlyPayment)}/mo × ${deal.termMonths} = ${money(financing.monthlyPayment * deal.termMonths)} (${money(financing.financeCharge)} finance charge)`
                      : 'Set a term to compute payments (outside financing).'}
                </div>
              </div>
            </div>
          </div>

          {/* LienHolder */}
          <div style={{ ...card, padding: '18px 20px' }}>
            <div style={{ ...eyebrow, marginBottom: 12 }}>LienHolder</div>
            <LienholderPicker
              current={deal.lienholderPartner}
              editable={editable}
              onPick={(pid) => patch({ lienholderPartnerId: pid })}
              onClear={() => patch({ lienholderPartnerId: null })}
            />
          </div>

          {/* Notes */}
          <div ref={notesRef} style={{ ...card, padding: '18px 20px' }}>
            <div style={{ ...eyebrow, marginBottom: 12 }}>Deal Notes</div>
            <NotesBox value={deal.notes} editable={editable} onSave={(nv) => patch({ notes: nv })} />
          </div>
        </div>

        {/* ══ Deal Summary rail ══ */}
        <div style={{ ...card, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>Deal Summary</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['print', 'mail', 'sms'] as const).map(k => (
                <span key={k} title="Send deal summary — Phase 5" style={{
                  width: 26, height: 26, borderRadius: 7, display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center',
                  background: 'var(--bg-primary)', color: 'var(--text-muted)', opacity: 0.6,
                }}>
                  {k === 'print' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></svg>}
                  {k === 'mail' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg>}
                  {k === 'sms' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>}
                </span>
              ))}
            </div>
          </div>

          {/* Down / term headline */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                {money(deal.depositCredit)}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 5 }}>Down</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                {deal.termMonths ?? 0}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 5 }}>term</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2, paddingBottom: 12, borderBottom: '1px solid var(--border-light)' }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                {(deal.apr ?? 0).toFixed(2)}%
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 5 }}>APR</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                {money0(financing.monthlyPayment)}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 5 }}>/months</span>
            </div>
          </div>

          {/* Money rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '12px 0', borderBottom: '1px solid var(--border-light)' }}>
            <SumRow label="Amount Financed" value={money(totals.balanceDue)} />
            <SumRow label="Finance Charge" value={money(financing.financeCharge)} />
            <SumRow label={`Deal Costs${trueCost != null ? ` (${money0(deal.vehicle.vehicleCost!)} + ${money0(costAddsTotal)} recon)` : ''}`} value={trueCost != null ? money0(trueCost) : '—'} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '12px 0', borderBottom: '1px solid var(--border-light)' }}>
            <SumRow label="Back Gross" value={money(profit.backGross)} tone={profit.backGross < 0 ? 'bad' : 'ok'} />
            <SumRow label="Front Gross" value={profit.frontGross != null ? money(profit.frontGross) : '—'} tone={profit.frontGross != null && profit.frontGross < 0 ? 'bad' : 'ok'} />
            {overAllowance > 0 && <SumRow label="· incl. trade over-allowance" value={`−${money0(overAllowance)}`} tone="bad" small />}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Total Gross</span>
              <span style={{ fontSize: 14.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: profit.totalGross != null && profit.totalGross < 0 ? '#e11d48' : 'var(--text-primary)' }}>
                {profit.totalGross != null ? money(profit.totalGross) : '—'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '12px 0', borderBottom: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Commissions</span>
              <FMoney value={deal.commissions} editable={editable} width={110} small onSave={(n) => patch({ commissions: n })} />
            </div>
            <SumRow label="Doc / Dealer Fees" value={money(profit.feeProfit)} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Net Profit</span>
              <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: profit.netProfit != null && profit.netProfit < 0 ? '#e11d48' : '#16a34a' }}>
                {profit.netProfit != null ? money(profit.netProfit) : '—'}
              </span>
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
              {trueCost == null
                ? 'Add the vehicle cost on its detail page to see gross & profit.'
                : 'Front + back gross + dealer fees − commissions. Estimate.'}
            </div>
          </div>

          {/* Actions */}
          <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {deal.status === 'funded' ? (
              <div style={{
                padding: '12px 14px', borderRadius: 10, textAlign: 'center',
                background: '#edfaf0', border: '1px solid #bbf7d0',
                fontSize: 13, fontWeight: 700, color: '#16a34a',
              }}>✓ Funded {deal.fundedAt ? new Date(deal.fundedAt).toLocaleDateString() : ''}</div>
            ) : deal.status === 'cancelled' ? (
              <div style={{
                padding: '12px 14px', borderRadius: 10, textAlign: 'center',
                background: '#fdecef', border: '1px solid #fecaca',
                fontSize: 13, fontWeight: 700, color: '#e11d48',
              }}>Cancelled</div>
            ) : (
              <>
                {!ready && (
                  <div style={{
                    padding: '8px 12px', borderRadius: 9,
                    background: '#fdf3e7', border: '1px solid #fde68a',
                    fontSize: 11.5, fontWeight: 600, color: '#b45309',
                  }}>Needs {blockers.join(' · ')}</div>
                )}
                <button
                  disabled={!ready}
                  onClick={() => setConfirm({
                    title: `Fund ${formatDealNumber(deal.dealNumber)}?`,
                    body: `Closes the deal at ${money(totals.otdTotal)} out-the-door: the ${[deal.vehicle.year, deal.vehicle.make, deal.vehicle.model].filter(Boolean).join(' ')} is marked sold${isWholesale ? ` to ${deal.businessBuyer?.businessName}` : deal.buyer ? `, ${deal.buyer.firstName} ${deal.buyer.lastName} becomes a customer` : ''}, and the deal locks.`,
                    confirmLabel: 'Fund Deal',
                    onConfirm: fund,
                  })}
                  style={{
                    width: '100%', padding: '12px 20px', borderRadius: 12, minHeight: 0, border: 'none',
                    background: ready ? '#1a1a1a' : 'var(--lane-bg)',
                    color: ready ? '#ffffff' : 'var(--text-muted)',
                    fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.005em',
                    cursor: ready ? 'pointer' : 'not-allowed',
                    boxShadow: ready ? '0 6px 16px -8px rgba(24,24,27,0.35)' : 'none',
                    transition: 'background 0.18s ease',
                  }}
                  onMouseEnter={(e) => { if (ready) e.currentTarget.style.background = '#2a2a2a' }}
                  onMouseLeave={(e) => { if (ready) e.currentTarget.style.background = '#1a1a1a' }}
                >Mark Funded</button>
              </>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <DisabledPill label="Contract (Paper)" hint="Documents — Phase 5" />
              <DisabledPill label="eContract" hint="E-sign — Phase 5" />
            </div>
            <DisabledPill label="Request Stips from Customer" hint="Coming soon" full />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
              Rep: {deal.salesRep?.name || '—'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Confirm dialog ── */}
      {confirm && (
        <div className="mm-backdrop" onClick={() => setConfirm(null)}>
          <div className="mm-panel" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, padding: 22 }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-primary)', marginBottom: 8 }}>
              {confirm.title}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 16 }}>
              {confirm.body}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirm(null)} style={{
                padding: '9px 16px', borderRadius: 12, minHeight: 0,
                border: '1px solid var(--border)', background: '#fff',
                fontSize: 13.5, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer',
              }}>Not yet</button>
              <button
                onClick={() => { const c = confirm; setConfirm(null); c.onConfirm() }}
                style={{
                  padding: '9px 18px', borderRadius: 12, minHeight: 0, border: 'none',
                  background: confirm.danger ? '#ef4444' : '#1a1a1a',
                  color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
                }}
              >{confirm.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Building blocks ─────────────────────────────────────────────────

function RailBtn({ label, onClick, disabled, hint, danger }: {
  label: string; onClick?: () => void; disabled?: boolean; hint?: string; danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={hint}
      style={{
        width: '100%', textAlign: 'left', padding: '10px 13px', minHeight: 0,
        borderRadius: 10, border: 'none', background: 'transparent',
        color: disabled ? 'var(--text-muted)' : danger ? '#e11d48' : 'var(--text-primary)',
        fontSize: 13, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        transition: 'background 0.12s ease',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = danger ? 'rgba(225,29,72,0.07)' : 'var(--bg-primary)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      {label}
      {hint && <span style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: 'var(--text-muted)', marginTop: 1 }}>{hint}</span>}
    </button>
  )
}

function SLine({ sign, label, right, strong }: { sign: string; label: string; right: React.ReactNode; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
      <span style={{ width: 12, textAlign: 'center', fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>{sign}</span>
      <span style={{
        flex: 1, minWidth: 0, fontSize: 13, fontWeight: strong ? 640 : 500,
        color: strong ? 'var(--text-primary)' : 'var(--text-secondary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{label}</span>
      {right}
    </div>
  )
}

function SumRow({ label, value, tone, small }: { label: string; value: string; tone?: 'ok' | 'bad'; small?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ fontSize: small ? 11 : 12.5, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{
        fontSize: small ? 11 : 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
        color: tone === 'bad' ? '#e11d48' : tone === 'ok' ? '#16a34a' : 'var(--text-primary)',
      }}>{value}</span>
    </div>
  )
}

function DisabledPill({ label, hint, full }: { label: string; hint: string; full?: boolean }) {
  return (
    <button disabled title={hint} style={{
      flex: full ? undefined : 1, width: full ? '100%' : undefined,
      padding: '9px 10px', borderRadius: 10, minHeight: 0,
      border: '1px dashed var(--border)', background: 'transparent',
      fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', cursor: 'not-allowed',
    }}>{label}</button>
  )
}

function LockedBox({ amount, strong }: { amount: number; strong?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
      width: 140, height: 34, boxSizing: 'border-box', padding: '0 9px 0 11px',
      borderRadius: 9, border: '1px solid var(--border-light)', background: 'var(--bg-primary)',
    }}>
      <span style={{ fontSize: 13, fontWeight: strong ? 700 : 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
        {money(amount)}
      </span>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    </div>
  )
}

function FMoney({ value, editable, onSave, width = 140, small, noDollar }: {
  value: number; editable: boolean; onSave: (n: number) => void
  width?: number; small?: boolean; noDollar?: boolean
}) {
  const [draft, setDraft] = useState(value ? String(value) : '')
  const [focused, setFocused] = useState(false)
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
    const nv = Number.isNaN(n) ? 0 : n
    if (nv !== value) onSave(nv)
  }

  if (!editable) return <LockedBox amount={value} />

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      width, height: small ? 30 : 34, boxSizing: 'border-box', padding: '0 10px',
      borderRadius: 9,
      border: focused ? '1px solid #c4e050' : '1px solid var(--border)',
      background: focused ? '#fff' : 'var(--bg-primary)',
      boxShadow: focused ? '0 0 0 3px rgba(223,253,110,0.2)' : 'none',
      transition: 'border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
    }}>
      {!noDollar && <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600 }}>$</span>}
      <input
        value={focused
          ? draft
          : (() => { const n = parseFloat(draft.replace(/[^0-9.]/g, '')); return Number.isNaN(n) || !n ? '' : n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0 }) })()}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        placeholder="0"
        inputMode="decimal"
        style={{
          flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
          fontSize: small ? 12.5 : 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
          color: 'var(--text-primary)', textAlign: 'right', padding: 0,
        }}
      />
    </div>
  )
}

function FInt({ value, editable, onSave, width = 64 }: {
  value: number | null; editable: boolean; onSave: (n: number | null) => void; width?: number
}) {
  const [draft, setDraft] = useState(value != null ? String(value) : '')
  const [focused, setFocused] = useState(false)
  const lastValue = useRef(value)
  useEffect(() => {
    if (lastValue.current !== value) {
      lastValue.current = value
      if (!focused) setDraft(value != null ? String(value) : '')
    }
  }, [value, focused])

  function commit() {
    setFocused(false)
    const n = parseInt(draft.replace(/\D/g, ''), 10)
    const nv = Number.isNaN(n) ? null : n
    if (nv !== value) onSave(nv)
  }

  return (
    <div style={{
      width, height: 34, boxSizing: 'border-box', padding: '0 10px',
      display: 'flex', alignItems: 'center',
      borderRadius: 9,
      border: focused ? '1px solid #c4e050' : '1px solid var(--border)',
      background: editable ? (focused ? '#fff' : 'var(--bg-primary)') : 'var(--lane-bg)',
      boxShadow: focused ? '0 0 0 3px rgba(223,253,110,0.2)' : 'none',
      transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    }}>
      <input
        disabled={!editable}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        placeholder="0"
        inputMode="numeric"
        style={{
          flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
          fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
          color: 'var(--text-primary)', textAlign: 'right', padding: 0,
        }}
      />
    </div>
  )
}

// ─── Lienholder picker (Partner list) ────────────────────────────────

function LienholderPicker({ current, editable, onPick, onClear }: {
  current: { id: string; companyName: string } | null
  editable: boolean
  onPick: (partnerId: string) => void
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

  if (current) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        padding: '10px 14px', borderRadius: 10, maxWidth: 420,
        background: 'var(--bg-primary)', border: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 13.5, fontWeight: 640, color: 'var(--text-primary)' }}>{current.companyName}</span>
        {editable && (
          <button onClick={onClear} title="Remove lienholder" style={{
            width: 24, height: 24, minHeight: 0, borderRadius: 7, border: 'none', padding: 0,
            background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        )}
      </div>
    )
  }

  if (!editable) return <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>None — cash deal.</div>

  return (
    <div style={{ position: 'relative', maxWidth: 420 }}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder="Search partners (lenders) — optional on cash deals…"
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
          maxHeight: 200, overflowY: 'auto',
        }}>
          {hits.length === 0 ? (
            <div style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
              {q.trim() ? 'No partners found.' : 'Type to search your partner list…'}
            </div>
          ) : hits.map(h => (
            <button key={h.id} onMouseDown={() => { onPick(h.id); setQ('') }} style={{
              width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 7,
              border: 'none', minHeight: 0, background: 'transparent', cursor: 'pointer',
              fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)',
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

// ─── Notes (commit on blur) ──────────────────────────────────────────

function NotesBox({ value, editable, onSave }: {
  value: string | null
  editable: boolean
  onSave: (v: string | null) => void
}) {
  const [draft, setDraft] = useState(value ?? '')
  const lastValue = useRef(value)
  useEffect(() => {
    if (lastValue.current !== value) {
      lastValue.current = value
      setDraft(value ?? '')
    }
  }, [value])

  if (!editable && !draft) return <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No notes.</div>

  return (
    <textarea
      value={draft}
      disabled={!editable}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { const nv = draft.trim() || null; if (nv !== (value ?? null)) onSave(nv) }}
      placeholder="Anything worth remembering about this deal…"
      rows={4}
      style={{
        width: '100%', boxSizing: 'border-box', padding: '10px 12px',
        borderRadius: 10, border: '1px solid var(--border)',
        background: editable ? '#fff' : 'var(--lane-bg)',
        fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)',
        outline: 'none', resize: 'vertical', fontFamily: 'inherit',
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = '#c4e050'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(223,253,110,0.2)' }}
      onBlurCapture={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
    />
  )
}
