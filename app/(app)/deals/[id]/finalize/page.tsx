'use client'

// ─── Deal Finalize — the deal's command center (DC "Deal Contract") ───
// Reached via "Proceed with Deal" on the jacket. Read-only structure
// recap + lienholder + notes, a real gross/profit panel computed from the
// vehicle's true cost (vehicleCost + CostAdds — data DC makes you type),
// and the terminal actions: Mark Funded / Cancel Deal.
// Money-gated end to end: the APIs this page calls enforce
// admin + sales_manager server-side on every request.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { computeDealTotals, formatDealNumber, LINE_ITEM_CATEGORIES, type DealTotals } from '@/lib/deals'

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
  notes: string | null
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
  salesRep: { id: string; name: string } | null
  lienholderPartner: { id: string; companyName: string } | null
  lineItems: Array<{ category: string; label: string; amount: number; taxable: boolean; cost: number | null }>
  trades: Array<{ allowance: number; acv: number; payoff: number; year: number | null; make: string | null; model: string | null }>
}

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

export default function DealFinalizePage() {
  const params = useParams()
  const router = useRouter()
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string)

  const [deal, setDeal] = useState<FinalizeDeal | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<null | { title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void }>(null)

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
      else {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Could not cancel')
      }
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

  // ── Gross / profit (money-gated data) ──
  // True cost = vehicle purchase cost + every recon CostAdd (cents).
  const costAddsTotal = deal.vehicle.costAdds.reduce((s, c) => s + c.amountCents, 0) / 100
  const trueCost = deal.vehicle.vehicleCost != null ? deal.vehicle.vehicleCost + costAddsTotal : null
  // Over-allowance on trades (paying above ACV) eats front gross.
  const overAllowance = deal.trades.reduce((s, t) => s + Math.max(0, (t.allowance || 0) - (t.acv || t.allowance || 0)), 0)
  const frontGross = trueCost != null ? deal.salePrice - trueCost - overAllowance : null
  // Back gross = margin on non-fee add-ons (price − dealer cost per line).
  const backGross = deal.lineItems
    .filter(li => li.category !== 'fee')
    .reduce((s, li) => s + (li.amount || 0) - (li.cost || 0), 0)
  const totalGross = frontGross != null ? frontGross + backGross : null

  // ── Readiness (mirrors the jacket snapshot's required set, compactly) ──
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
  } else if (!b) {
    blockers.push('a buyer')
  } else {
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

  const RecapLine = ({ label, amount, sign, strong }: { label: string; amount: number; sign: '+' | '−' | '='; strong?: boolean }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6.5px 0' }}>
      <span style={{ width: 14, textAlign: 'center', fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>{sign}</span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: strong ? 640 : 500, color: strong ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 13.5, fontWeight: strong ? 700 : 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{money(amount)}</span>
    </div>
  )

  const railBtn = (label: string, opts: { onClick?: () => void; disabled?: boolean; hint?: string; danger?: boolean } = {}) => (
    <button
      key={label}
      onClick={opts.onClick}
      disabled={opts.disabled}
      title={opts.hint}
      style={{
        width: '100%', textAlign: 'left', padding: '10px 13px', minHeight: 0,
        borderRadius: 10, border: 'none',
        background: 'transparent',
        color: opts.disabled ? 'var(--text-muted)' : opts.danger ? '#e11d48' : 'var(--text-primary)',
        fontSize: 13, fontWeight: 600,
        cursor: opts.disabled ? 'not-allowed' : 'pointer',
        opacity: opts.disabled ? 0.55 : 1,
        transition: 'background 0.12s ease',
      }}
      onMouseEnter={(e) => { if (!opts.disabled) e.currentTarget.style.background = opts.danger ? 'rgba(225,29,72,0.07)' : 'var(--bg-primary)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      {label}
      {opts.hint && <span style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: 'var(--text-muted)', marginTop: 1 }}>{opts.hint}</span>}
    </button>
  )

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      {/* ── Header: deal identity chips ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => router.push(`/deals/${deal.id}`)} style={{
            padding: '8px 13px', borderRadius: 10, minHeight: 0,
            border: '1px solid var(--border)', background: '#fff', cursor: 'pointer',
            fontSize: 13, color: 'var(--text-primary)', fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: 'var(--shadow-sm)',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            Worksheet
          </button>
          {/* Vehicle chip */}
          <Link href={`/vehicles/${deal.vehicle.id}`} style={{
            display: 'inline-flex', flexDirection: 'column', minHeight: 0,
            padding: '6px 13px', borderRadius: 10, textDecoration: 'none',
            border: '1px solid var(--border)', background: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 640, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
              {[deal.vehicle.year, deal.vehicle.make, deal.vehicle.model].filter(Boolean).join(' ')}
            </span>
            <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              #{deal.vehicle.stockNumber}
            </span>
          </Link>
          {/* Buyer chip */}
          <Link
            href={deal.buyer ? `/customers/${deal.buyer.id}` : '#'}
            style={{
              display: 'inline-flex', flexDirection: 'column', minHeight: 0,
              padding: '6px 13px', borderRadius: 10, textDecoration: 'none',
              border: '1px solid var(--border)', background: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 640, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>{buyerName}</span>
            <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
              {isWholesale ? 'Business buyer' : deal.buyer?.phone || 'Buyer'}
            </span>
          </Link>
          <span style={{
            fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 100,
            background: deal.status === 'funded' ? '#edfaf0' : deal.status === 'cancelled' ? '#fdecef' : '#fdf3e7',
            color: deal.status === 'funded' ? '#16a34a' : deal.status === 'cancelled' ? '#e11d48' : '#d97706',
          }}>{deal.status === 'funded' ? 'Funded' : deal.status === 'cancelled' ? 'Cancelled' : 'Draft'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {saving && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Saving…</span>}
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
            {formatDealNumber(deal.dealNumber)} · {isWholesale ? 'Wholesale' : 'Retail'} · {new Date(deal.createdAt).toLocaleDateString()}
          </span>
        </div>
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

      <div style={{ display: 'grid', gridTemplateColumns: '190px minmax(0, 1fr) 330px', gap: 16, alignItems: 'start' }}>
        {/* ══ Action rail (deal-scoped, DC-style) ══ */}
        <div style={{ ...card, padding: 8, position: 'sticky', top: 16 }}>
          {railBtn('Edit Worksheet', { onClick: () => router.push(`/deals/${deal.id}`) })}
          {!isWholesale && deal.buyer && railBtn('Customer View', { onClick: () => router.push(`/customers/${deal.buyer!.id}`) })}
          {railBtn('Print', { disabled: true, hint: 'Documents — Phase 5' })}
          {railBtn('Payments', { disabled: true, hint: 'Coming soon' })}
          {railBtn('Stipulations', { disabled: true, hint: 'Coming soon' })}
          {editable && (
            <>
              <div style={{ height: 1, background: 'var(--border-light)', margin: '6px 4px' }} />
              {railBtn('Cancel Deal', {
                danger: true,
                onClick: () => setConfirm({
                  title: 'Cancel this deal?',
                  body: 'The worksheet is kept for reference, but the deal closes and can no longer be edited or funded.',
                  confirmLabel: 'Cancel Deal',
                  danger: true,
                  onConfirm: cancelDeal,
                }),
              })}
            </>
          )}
        </div>

        {/* ══ Main column ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {/* Structure recap */}
          <div style={{ ...card, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={eyebrow}>Structure</span>
              {editable && (
                <Link href={`/deals/${deal.id}`} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none', minHeight: 0 }}>
                  Edit on worksheet →
                </Link>
              )}
            </div>
            <RecapLine sign="+" label="Price" amount={deal.salePrice} strong />
            {LINE_ITEM_CATEGORIES.map(c => {
              const amt = catTotal(c.key)
              return amt ? <RecapLine key={c.key} sign="+" label={c.label} amount={amt} /> : null
            })}
            <RecapLine sign="+" label={isWholesale ? 'Total Tax (wholesale)' : deal.collectTax ? `Total Tax (${((deal.stateTaxRate + deal.countySurtaxRate) * 100).toFixed(1)}% FL)` : 'Total Tax (out-of-state)'} amount={totals.taxAmount} />
            {deal.depositCredit > 0 && <RecapLine sign="−" label="Deposit / Cash Received" amount={deal.depositCredit} />}
            {totals.netTradeEquity !== 0 && <RecapLine sign="−" label="Trade-In Equity" amount={totals.netTradeEquity} />}
            <div style={{ borderTop: '1px solid var(--border-light)', marginTop: 8, paddingTop: 8 }}>
              <RecapLine sign="=" label="Amount Financed" amount={totals.balanceDue} strong />
            </div>
          </div>

          {/* Lienholder */}
          <div style={{ ...card, padding: '18px 20px' }}>
            <div style={{ ...eyebrow, marginBottom: 12 }}>Lienholder</div>
            <LienholderPicker
              current={deal.lienholderPartner}
              editable={editable}
              onPick={(pid) => patch({ lienholderPartnerId: pid })}
              onClear={() => patch({ lienholderPartnerId: null })}
            />
          </div>

          {/* Notes */}
          <div style={{ ...card, padding: '18px 20px' }}>
            <div style={{ ...eyebrow, marginBottom: 12 }}>Deal Notes</div>
            <NotesBox value={deal.notes} editable={editable} onSave={(v) => patch({ notes: v })} />
          </div>
        </div>

        {/* ══ Deal Summary rail ══ */}
        <div style={{ ...card, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ ...eyebrow, marginBottom: 12 }}>Deal Summary</div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 12, borderBottom: '1px solid var(--border-light)' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)' }}>Amount Financed</span>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
              {money(totals.balanceDue)}
            </span>
          </div>

          {/* Gross — real numbers from vehicle cost + cost adds */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '12px 0', borderBottom: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                True cost{trueCost != null ? ` (${money0(deal.vehicle.vehicleCost!)} + ${money0(costAddsTotal)} recon)` : ''}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                {trueCost != null ? money0(trueCost) : '—'}
              </span>
            </div>
            {overAllowance > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Trade over-allowance</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#e11d48' }}>−{money0(overAllowance)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)' }}>Front Gross</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: frontGross != null && frontGross < 0 ? '#e11d48' : '#16a34a' }}>
                {frontGross != null ? money0(frontGross) : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)' }}>Back Gross</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: backGross < 0 ? '#e11d48' : '#16a34a' }}>
                {money0(backGross)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Total Gross</span>
              <span style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: totalGross != null && totalGross < 0 ? '#e11d48' : 'var(--text-primary)' }}>
                {totalGross != null ? money0(totalGross) : '—'}
              </span>
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
              {trueCost == null
                ? 'Add the vehicle cost on its detail page to see gross.'
                : 'Estimate — commissions/pack not yet deducted.'}
            </div>
          </div>

          {/* Fund / status */}
          <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {deal.status === 'funded' ? (
              <div style={{
                padding: '12px 14px', borderRadius: 10, textAlign: 'center',
                background: '#edfaf0', border: '1px solid #bbf7d0',
                fontSize: 13, fontWeight: 700, color: '#16a34a',
              }}>
                ✓ Funded {deal.fundedAt ? new Date(deal.fundedAt).toLocaleDateString() : ''}
              </div>
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
                  }}>
                    Needs {blockers.join(' · ')}
                  </div>
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
              <button disabled title="Documents & e-sign — Phase 5" style={{
                flex: 1, padding: '9px 10px', borderRadius: 10, minHeight: 0,
                border: '1px dashed var(--border)', background: 'transparent',
                fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', cursor: 'not-allowed',
              }}>Contract (Paper)</button>
              <button disabled title="Documents & e-sign — Phase 5" style={{
                flex: 1, padding: '9px 10px', borderRadius: 10, minHeight: 0,
                border: '1px dashed var(--border)', background: 'transparent',
                fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', cursor: 'not-allowed',
              }}>eContract</button>
            </div>
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
        padding: '10px 14px', borderRadius: 10,
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
        placeholder="Search partners (lenders) to attach — optional for cash…"
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
      onBlur={() => { const v = draft.trim() || null; if (v !== (value ?? null)) onSave(v) }}
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
