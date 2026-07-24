'use client'

// ─── Deal Contract page — deal focus mode ─────────────────────────────
// Entering a deal replaces the global sidebar with a dark deal-scoped
// rail (DC-style): the page adds `deal-focus` to <html>, which hides the
// app nav (see layout.tsx CSS) and this page mounts its own 220px rail.
// Content: header chips → tab rail → [Structure + LienHolder + Notes |
// Deal Summary]. Financing sits UNDER the money structure. Money-gated
// server-side on every request.

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
  { key: 'notes', label: 'Notes', disabled: true },
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

  // Deal focus mode: swap the global sidebar for this page's deal rail.
  useEffect(() => {
    document.documentElement.classList.add('deal-focus')
    return () => document.documentElement.classList.remove('deal-focus')
  }, [])

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

  const costAddsTotal = deal.vehicle.costAdds.reduce((s, c) => s + c.amountCents, 0) / 100
  const trueCost = deal.vehicle.vehicleCost != null ? deal.vehicle.vehicleCost + costAddsTotal : null
  const overAllowance = deal.trades.reduce((s, t) => s + Math.max(0, (t.allowance || 0) - (t.acv || t.allowance || 0)), 0)
  const profit = computeDealProfit({
    salePrice: deal.salePrice, trueCost, overAllowance,
    lineItems: deal.lineItems, commissions: deal.commissions,
  })

  // Readiness (mirrors the jacket snapshot)
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
    <>
      {/* ══ Deal rail — replaces the global sidebar while in the deal ══ */}
      <aside className="desktop-sidebar" style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, width: 220,
        background: '#141414', flexDirection: 'column', zIndex: 40,
        display: 'none',
      }}>
        <div style={{ padding: '20px 14px 14px' }}>
          <button onClick={() => router.push('/deals')} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '7px 11px', minHeight: 0, borderRadius: 9, border: 'none',
            background: 'rgba(255,255,255,0.06)', color: '#b0b0b0',
            fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            transition: 'background 0.15s ease, color 0.15s ease',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#b0b0b0' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            Exit Deal
          </button>
          <div style={{ marginTop: 14, padding: '0 4px' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>
              {formatDealNumber(deal.dealNumber)}
            </div>
            <div style={{ fontSize: 11.5, color: '#808080', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {buyerName}
            </div>
            <span style={{
              display: 'inline-block', marginTop: 7,
              fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 100,
              textTransform: 'uppercase', letterSpacing: '0.05em',
              background: deal.status === 'funded' ? 'rgba(34,197,94,0.15)' : deal.status === 'cancelled' ? 'rgba(239,68,68,0.15)' : 'rgba(223,253,110,0.12)',
              color: deal.status === 'funded' ? '#4ade80' : deal.status === 'cancelled' ? '#f87171' : '#dffd6e',
            }}>{deal.status === 'funded' ? 'Funded' : deal.status === 'cancelled' ? 'Cancelled' : 'Working Deal'}</span>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '4px 10px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' }}>
          <DealRailItem icon={ICON_SHEET} label="Worksheet" onClick={() => router.push(`/deals/${deal.id}`)} />
          {!isWholesale && deal.buyer && (
            <DealRailItem icon={ICON_EYE} label="Customer View" onClick={() => router.push(`/customers/${deal.buyer!.id}`)} />
          )}
          <DealRailItem icon={ICON_PRINT} label="Print" disabled hint="Documents — Phase 5" />
          <DealRailItem icon={ICON_DOLLAR} label="Payments" disabled hint="Coming soon" />
          <DealRailItem icon={ICON_STIPS} label="Stipulations" disabled hint="Coming soon" />
          <DealRailItem icon={ICON_BANK} label="Lender Fees" disabled hint="Outside financing" />
          <DealRailItem icon={ICON_TURBO} label="TurboPass" disabled hint="Credit — Phase 6" />
          {editable && (
            <>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 6px' }} />
              <DealRailItem
                icon={ICON_X}
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
        </nav>

        <div style={{ padding: '14px 18px 18px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 11, color: '#555' }}>Rep</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#b0b0b0', marginTop: 1 }}>{deal.salesRep?.name || '—'}</div>
        </div>
      </aside>

      {/* ══ Content ══ */}
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        {/* Header band */}
        <div style={{
          ...card, padding: '13px 18px', marginBottom: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', minWidth: 0 }}>
            <Link href={`/vehicles/${deal.vehicle.id}`} style={{ textDecoration: 'none', minHeight: 0, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 640, letterSpacing: '-0.01em', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                {[deal.vehicle.year, deal.vehicle.make, deal.vehicle.model].filter(Boolean).join(' ')}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                Stock #{deal.vehicle.stockNumber}{deal.vehicle.vin ? ` · ${deal.vehicle.vin.slice(-8)}` : ''}
              </div>
            </Link>
            <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-light)' }} />
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {saving && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Saving…</span>}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)' }}>
                {isWholesale ? 'Wholesale' : 'Retail · Cash'}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {new Date(deal.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>

        {/* Tab rail */}
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

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 16, alignItems: 'start' }}>
          {/* ══ Left: Structure (financing under it) + LienHolder + Notes ══ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <div style={{ ...card, padding: '20px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>Structure</span>
                <button disabled title="Solve price from a target payment — coming with outside financing" style={{
                  padding: '5px 12px', borderRadius: 8, minHeight: 0,
                  border: '1px dashed var(--border)', background: 'transparent',
                  fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', cursor: 'not-allowed',
                }}>Roll Back</button>
              </div>

              {/* Money stack */}
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
                        width: 150, height: 36, boxSizing: 'border-box', padding: '0 9px 0 12px',
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

              {/* Financing — under the structure, not beside it */}
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border-light)' }}>
                <div style={{ ...eyebrow, marginBottom: 12 }}>Financing</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px 24px' }}>
                  <FinRow label="Term">
                    <FInt value={deal.termMonths} editable={editable} width={70} onSave={(n) => patch({ termMonths: n })} />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>months</span>
                  </FinRow>
                  <FinRow label="Interest Rate">
                    <FMoney value={deal.apr ?? 0} editable={editable} width={84} noDollar onSave={(n) => patch({ apr: n })} />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>% APR</span>
                  </FinRow>
                  <FinRow label="Monthly Payment">
                    <LockedBox amount={financing.monthlyPayment} width={110} />
                  </FinRow>
                  <FinRow label="First Payment">
                    <FInt value={deal.firstPaymentDays} editable={editable} width={58} onSave={(n) => patch({ firstPaymentDays: n ?? 30 })} />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>days · {firstPaymentDate.toLocaleDateString()}</span>
                  </FinRow>
                </div>
                <div style={{
                  marginTop: 14, padding: '10px 13px', borderRadius: 9,
                  background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
                  fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5,
                }}>
                  {totals.balanceDue <= 0
                    ? 'Cash deal — nothing left to finance.'
                    : deal.termMonths
                      ? `${money(financing.monthlyPayment)}/mo × ${deal.termMonths} = ${money(financing.monthlyPayment * deal.termMonths)} (${money(financing.financeCharge)} finance charge)`
                      : 'Set a term to compute payments (outside financing).'}
                </div>
              </div>
            </div>

            {/* LienHolder */}
            <div style={{ ...card, padding: '20px 22px' }}>
              <div style={{ ...eyebrow, marginBottom: 12 }}>LienHolder</div>
              <LienholderPicker
                current={deal.lienholderPartner}
                editable={editable}
                onPick={(pid) => patch({ lienholderPartnerId: pid })}
                onClear={() => patch({ lienholderPartnerId: null })}
              />
            </div>

          </div>

          {/* ══ Right: Deal Summary — roomy ══ */}
          <div style={{ ...card, padding: '22px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
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

            {/* Headline: Down / term / APR / payment */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 12px', paddingBottom: 18, borderBottom: '1px solid var(--border-light)' }}>
              <Headline value={money0(deal.depositCredit)} label="Down" />
              <Headline value={String(deal.termMonths ?? 0)} label="term" right />
              <Headline value={`${(deal.apr ?? 0).toFixed(2)}%`} label="APR" small />
              <Headline value={money0(financing.monthlyPayment)} label="/month" right small />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '16px 0', borderBottom: '1px solid var(--border-light)' }}>
              <SumRow label="Amount Financed" value={money(totals.balanceDue)} />
              <SumRow label="Finance Charge" value={money(financing.financeCharge)} />
              <SumRow label="Deal Costs" value={trueCost != null ? money0(trueCost) : '—'} sub={trueCost != null ? `${money0(deal.vehicle.vehicleCost!)} vehicle + ${money0(costAddsTotal)} recon` : 'Add vehicle cost on its detail page'} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '16px 0', borderBottom: '1px solid var(--border-light)' }}>
              <SumRow label="Back Gross" value={money(profit.backGross)} tone={profit.backGross < 0 ? 'bad' : 'ok'} />
              <SumRow label="Front Gross" value={profit.frontGross != null ? money(profit.frontGross) : '—'} tone={profit.frontGross != null && profit.frontGross < 0 ? 'bad' : 'ok'}
                sub={overAllowance > 0 ? `incl. −${money0(overAllowance)} trade over-allowance` : undefined} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 2 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>Total Gross</span>
                <span style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: profit.totalGross != null && profit.totalGross < 0 ? '#e11d48' : 'var(--text-primary)' }}>
                  {profit.totalGross != null ? money(profit.totalGross) : '—'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '16px 0', borderBottom: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Commissions</span>
                <FMoney value={deal.commissions} editable={editable} width={116} small onSave={(n) => patch({ commissions: n })} />
              </div>
              <SumRow label="Doc / Dealer Fees" value={money(profit.feeProfit)} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 4 }}>
                <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)' }}>Net Profit</span>
                <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: profit.netProfit != null && profit.netProfit < 0 ? '#e11d48' : '#16a34a' }}>
                  {profit.netProfit != null ? money(profit.netProfit) : '—'}
                </span>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                Front + back gross + dealer fees − commissions. Estimate.
              </div>
            </div>

            {/* Actions */}
            <div style={{ paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {deal.status === 'funded' ? (
                <div style={{
                  padding: '13px 14px', borderRadius: 10, textAlign: 'center',
                  background: '#edfaf0', border: '1px solid #bbf7d0',
                  fontSize: 13, fontWeight: 700, color: '#16a34a',
                }}>✓ Funded {deal.fundedAt ? new Date(deal.fundedAt).toLocaleDateString() : ''}</div>
              ) : deal.status === 'cancelled' ? (
                <div style={{
                  padding: '13px 14px', borderRadius: 10, textAlign: 'center',
                  background: '#fdecef', border: '1px solid #fecaca',
                  fontSize: 13, fontWeight: 700, color: '#e11d48',
                }}>Cancelled</div>
              ) : (
                <>
                  {!ready && (
                    <div style={{
                      padding: '9px 13px', borderRadius: 9,
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
                      width: '100%', padding: '13px 20px', borderRadius: 12, minHeight: 0, border: 'none',
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
    </>
  )
}

// ─── Rail item (dark sidebar) ────────────────────────────────────────

function DealRailItem({ icon, label, onClick, disabled, hint, danger }: {
  icon: React.ReactNode; label: string; onClick?: () => void
  disabled?: boolean; hint?: string; danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={hint}
      style={{
        display: 'flex', alignItems: 'center', gap: 13,
        width: '100%', textAlign: 'left', padding: '10px 14px', minHeight: 42,
        borderRadius: 10, border: 'none', background: 'transparent',
        color: disabled ? '#555' : danger ? '#f87171' : '#808080',
        fontSize: 14, fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s ease, color 0.15s ease',
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.10)' : 'rgba(255,255,255,0.06)'
        e.currentTarget.style.color = danger ? '#fca5a5' : '#b0b0b0'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = disabled ? '#555' : danger ? '#f87171' : '#808080'
      }}
    >
      <span style={{ display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  )
}

const I = (d: string) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
)
const ICON_SHEET = I('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5')
const ICON_EYE = I('M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7ZM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z')
const ICON_PRINT = I('M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z')
const ICON_DOLLAR = I('M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6')
const ICON_STIPS = I('M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11')
const ICON_BANK = I('M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3')
const ICON_TURBO = I('M13 2 3 14h9l-1 8 10-12h-9l1-8z')
const ICON_X = I('M18 6 6 18M6 6l12 12')

// ─── Content building blocks ─────────────────────────────────────────

function SLine({ sign, label, right, strong }: { sign: string; label: string; right: React.ReactNode; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
      <span style={{ width: 12, textAlign: 'center', fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>{sign}</span>
      <span style={{
        flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: strong ? 640 : 500,
        color: strong ? 'var(--text-primary)' : 'var(--text-secondary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{label}</span>
      {right}
    </div>
  )
}

function FinRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>{children}</div>
    </div>
  )
}

function Headline({ value, label, right, small }: { value: string; label: string; right?: boolean; small?: boolean }) {
  return (
    <div style={{ textAlign: right ? 'right' : 'left' }}>
      <span style={{ fontSize: small ? 15 : 22, fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
        {value}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{label}</span>
    </div>
  )
}

function SumRow({ label, value, tone, sub }: { label: string; value: string; tone?: 'ok' | 'bad'; sub?: string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{
          fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
          color: tone === 'bad' ? '#e11d48' : tone === 'ok' ? '#16a34a' : 'var(--text-primary)',
        }}>{value}</span>
      </div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function DisabledPill({ label, hint, full }: { label: string; hint: string; full?: boolean }) {
  return (
    <button disabled title={hint} style={{
      flex: full ? undefined : 1, width: full ? '100%' : undefined,
      padding: '10px 10px', borderRadius: 10, minHeight: 0,
      border: '1px dashed var(--border)', background: 'transparent',
      fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', cursor: 'not-allowed',
    }}>{label}</button>
  )
}

function LockedBox({ amount, strong, width = 150 }: { amount: number; strong?: boolean; width?: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
      width, height: 36, boxSizing: 'border-box', padding: '0 10px 0 12px',
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

function FMoney({ value, editable, onSave, width = 150, small, noDollar }: {
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

  if (!editable) return <LockedBox amount={value} width={width} />

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      width, height: small ? 32 : 36, boxSizing: 'border-box', padding: '0 11px',
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
      width, height: 36, boxSizing: 'border-box', padding: '0 11px',
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
        padding: '11px 14px', borderRadius: 10, maxWidth: 440,
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
    <div style={{ position: 'relative', maxWidth: 440 }}>
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
