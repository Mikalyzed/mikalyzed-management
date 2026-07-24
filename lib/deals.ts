// ─── Deal Desk math (Slice 1.5: retail cash, itemized, trades) ────────
//
// Single source of truth for the out-the-door worksheet. The API computes
// and stores taxAmount/otdTotal with this on every save; the worksheet UI
// calls the same function for live preview, so the two can never disagree.
//
// ⚠️ TAX (FL retail, VERIFY WITH ACCOUNTANT before real deals):
//  • 6% state + county discretionary surtax (1%), surtax on the first
//    $5,000 of the taxable base only.
//  • Taxable base = sale price + taxable line items (dealer fees like doc
//    are taxable; govt fees like title/reg are not — each line item carries
//    its own `taxable` flag) MINUS total trade-in allowance (FL taxes the
//    trade difference).
//  • collectTax=false → out-of-state buyer pays at their home registration.
// Rates are snapshotted per Deal row, editable, never hardcoded app-side.

export type DealLineItemInput = {
  category: string // fee | accessory | product | insurance
  label: string
  amount: number
  taxable: boolean
}

export type DealTradeInput = {
  allowance: number
  payoff: number
}

export type DealWorksheetInput = {
  salePrice: number
  collectTax: boolean
  stateTaxRate: number // e.g. 0.06
  countySurtaxRate: number // e.g. 0.01
  surtaxCap: number // e.g. 5000 — surtax applies to first $X of taxable base
  depositCredit: number
  lineItems: DealLineItemInput[]
  trades: DealTradeInput[]
}

export type DealTotals = {
  lineItemsTotal: number
  taxableFees: number
  tradeAllowanceTotal: number
  tradePayoffTotal: number
  netTradeEquity: number
  taxableBase: number
  stateTax: number
  countySurtax: number
  taxAmount: number
  otdTotal: number
  balanceDue: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function computeDealTotals(d: DealWorksheetInput): DealTotals {
  const salePrice = d.salePrice || 0
  const items = d.lineItems || []
  const trades = d.trades || []

  const lineItemsTotal = round2(items.reduce((s, i) => s + (i.amount || 0), 0))
  const taxableFees = round2(items.filter(i => i.taxable).reduce((s, i) => s + (i.amount || 0), 0))

  const tradeAllowanceTotal = round2(trades.reduce((s, t) => s + (t.allowance || 0), 0))
  const tradePayoffTotal = round2(trades.reduce((s, t) => s + (t.payoff || 0), 0))
  // Positive equity reduces what the buyer owes; negative (upside-down
  // trade) increases it.
  const netTradeEquity = round2(tradeAllowanceTotal - tradePayoffTotal)

  // FL taxes the trade DIFFERENCE: allowance comes off the base (floor 0).
  const taxableBase = Math.max(0, round2(salePrice + taxableFees - tradeAllowanceTotal))

  const stateTax = d.collectTax ? round2(taxableBase * (d.stateTaxRate || 0)) : 0
  const countySurtax = d.collectTax
    ? round2(Math.min(taxableBase, d.surtaxCap || 0) * (d.countySurtaxRate || 0))
    : 0
  const taxAmount = round2(stateTax + countySurtax)

  const otdTotal = round2(salePrice + lineItemsTotal + taxAmount)
  const balanceDue = round2(otdTotal - (d.depositCredit || 0) - netTradeEquity)

  return {
    lineItemsTotal, taxableFees,
    tradeAllowanceTotal, tradePayoffTotal, netTradeEquity,
    taxableBase, stateTax, countySurtax, taxAmount,
    otdTotal, balanceDue,
  }
}

export function formatDealNumber(n: number): string {
  return `D-${String(n).padStart(4, '0')}`
}

export const MAX_TRADES = 4

export const LINE_ITEM_CATEGORIES = [
  { key: 'fee', label: 'Fees' },
  { key: 'accessory', label: 'Accessories' },
  { key: 'product', label: 'VSC / Products' },
  { key: 'insurance', label: 'Ins / GAP / VSI' },
] as const

// Standard FL retail fee sheet (operator's DealerCenter defaults) —
// auto-populates the Fees itemizer when a retail deal is in FL-buyer mode.
// Never locked: every line stays editable/removable per deal. Taxable flags
// = dealer fees yes, government fees no — VERIFY WITH ACCOUNTANT.
export const FL_DEFAULT_FEES: DealLineItemInput[] = [
  { category: 'fee', label: 'License / Reg', amount: 310, taxable: false },
  { category: 'fee', label: 'Certificate of Title', amount: 135, taxable: false },
  { category: 'fee', label: 'Elec. Filing Fee', amount: 0, taxable: true },
  { category: 'fee', label: 'Temp. Tag Fee', amount: 12, taxable: false },
  { category: 'fee', label: 'Dealer Services', amount: 995, taxable: true },
  { category: 'fee', label: 'Lender Processing', amount: 0, taxable: true },
  { category: 'fee', label: 'Doc Stamp', amount: 0, taxable: false },
]

// Quick-pick suggestions per category. `taxable` is the default the pick
// seeds — editable per line. Doc fee taxable (dealer fee), govt fees not.
export const LINE_ITEM_PRESETS: Record<string, Array<{ label: string; taxable: boolean }>> = {
  fee: FL_DEFAULT_FEES.map(f => ({ label: f.label, taxable: f.taxable })),
  accessory: [
    { label: 'Window Tint', taxable: true },
    { label: 'Wheels / Tires', taxable: true },
    { label: 'Detail / Ceramic', taxable: true },
  ],
  product: [
    { label: 'Extended Warranty', taxable: false },
    { label: 'Service Contract', taxable: false },
  ],
  insurance: [
    { label: 'GAP', taxable: false },
  ],
}

// ⚠️⚠️ FL DISCRETIONARY SALES SURTAX BY COUNTY ⚠️⚠️
// The buyer's residence county controls the surtax (applied to the first
// $5,000). Full 67-county table transcribed 2026-07-24 from the official
// FL DOR Pointmatch "Discretionary Sales Surtax Rate Table"
// (https://pointmatch.floridarevenue.com) as provided by the operator.
// RATES CHANGE EACH JANUARY — the annual refresh routine PRs the new
// table for accountant review; accountant should also spot-check this
// baseline. Unknown/misspelled county → the deal's manual rate is left
// untouched (editable per deal as always).
export const FL_COUNTY_SURTAX: Record<string, number> = {
  'alachua': 0.015,
  'baker': 0.01,
  'bay': 0.01,
  'bradford': 0.01,
  'brevard': 0.01,
  'broward': 0.01,
  'calhoun': 0.015,
  'charlotte': 0.01,
  'citrus': 0,
  'clay': 0.015,
  'collier': 0,
  'columbia': 0.015,
  'desoto': 0.015,
  'de soto': 0.015,
  'dixie': 0.01,
  'duval': 0.015,
  'escambia': 0.015,
  'flagler': 0.01,
  'franklin': 0.015,
  'gadsden': 0.015,
  'gilchrist': 0.01,
  'glades': 0.01,
  'gulf': 0.01,
  'hamilton': 0.02,
  'hardee': 0.01,
  'hendry': 0.015,
  'hernando': 0.005,
  'highlands': 0.015,
  'hillsborough': 0.015,
  'holmes': 0.015,
  'indian river': 0.01,
  'jackson': 0.015,
  'jefferson': 0.01,
  'lafayette': 0.01,
  'lake': 0.01,
  'lee': 0.005,
  'leon': 0.015,
  'levy': 0.01,
  'liberty': 0.015,
  'madison': 0.015,
  'manatee': 0.01,
  'marion': 0.015,
  'martin': 0.005,
  'miami-dade': 0.01,
  'miami dade': 0.01,
  'monroe': 0.015,
  'nassau': 0.01,
  'okaloosa': 0.01,
  'okeechobee': 0.01,
  'orange': 0.005,
  'osceola': 0.015,
  'palm beach': 0.005,
  'pasco': 0.01,
  'pinellas': 0.01,
  'polk': 0.01,
  'putnam': 0.01,
  'santa rosa': 0.01,
  'sarasota': 0.01,
  'seminole': 0.01,
  'st johns': 0.005,
  'st. johns': 0.005,
  'st lucie': 0.01,
  'st. lucie': 0.01,
  'sumter': 0.01,
  'suwannee': 0.01,
  'taylor': 0.01,
  'union': 0.01,
  'volusia': 0.005,
  'wakulla': 0.015,
  'walton': 0.01,
  'washington': 0.015,
}

/** Rate for a buyer's county ("Miami-Dade", "broward county", …) or null if unknown. */
export function flCountySurtaxRate(county: string | null | undefined): number | null {
  if (!county) return null
  const key = county.trim().toLowerCase().replace(/\s+county$/, '')
  return key in FL_COUNTY_SURTAX ? FL_COUNTY_SURTAX[key] : null
}

// Taxability is hard-set, not user-facing: known preset labels carry their
// flag; custom lines fall back to the category default below (dealer fees
// and accessories are FL-taxable; service contracts / GAP are not).
// VERIFY WITH ACCOUNTANT — change here, not per deal.
export const CATEGORY_TAXABLE_DEFAULT: Record<string, boolean> = {
  fee: true,
  accessory: true,
  product: false,
  insurance: false,
}

export const DEAL_STATUSES = ['draft', 'funded', 'cancelled'] as const
export type DealStatus = (typeof DEAL_STATUSES)[number]
