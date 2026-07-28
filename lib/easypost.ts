/**
 * EasyPost Tracking API — live carrier status for part shipments.
 *
 * Tracking-only usage: we never buy labels or create shipments. A tracker is
 * registered when someone pastes a tracking number on a part; EasyPost
 * auto-detects the carrier and gives us status + estimated delivery, which
 * auto-fills the part's expected date (replacing manual entry).
 *
 * Config-guarded like every integration: no EASYPOST_API_KEY → no-ops.
 */

const API_KEY = process.env.EASYPOST_API_KEY
const BASE = 'https://api.easypost.com/v2'

export function isEasyPostConfigured(): boolean {
  return !!API_KEY
}

export type TrackerInfo = {
  id: string
  status: string // pre_transit | in_transit | out_for_delivery | delivered | available_for_pickup | return_to_sender | failure | cancelled | error | unknown
  carrier: string | null
  estDeliveryDate: Date | null
  publicUrl: string | null
}

function authHeader(): string {
  return `Basic ${Buffer.from(`${API_KEY}:`).toString('base64')}`
}

function parseTracker(t: Record<string, unknown>): TrackerInfo {
  return {
    id: String(t.id),
    status: typeof t.status === 'string' ? t.status : 'unknown',
    carrier: typeof t.carrier === 'string' ? t.carrier : null,
    estDeliveryDate: typeof t.est_delivery_date === 'string' && t.est_delivery_date
      ? new Date(t.est_delivery_date)
      : null,
    publicUrl: typeof t.public_url === 'string' ? t.public_url : null,
  }
}

/**
 * The tracking field is typed by humans: "USPS 9400…", "Fed Ex 527…",
 * "Back Order". Pull out the actual code (and remember the carrier word as
 * a hint for the retry).
 */
const CARRIER_WORDS: Array<[RegExp, string]> = [
  [/\bfed\s*ex\b/i, 'FedEx'],
  [/\busps\b/i, 'USPS'],   // before UPS — "USPS" contains "ups"
  [/\bups\b/i, 'UPS'],
  [/\bdhl\b/i, 'DHL'],
  [/\bontrac\b/i, 'OnTrac'],
]
export function extractTrackingCode(raw: string): { code: string | null; carrierHint: string | null } {
  let s = raw.trim()
  let carrierHint: string | null = null
  for (const [re, name] of CARRIER_WORDS) {
    if (re.test(s)) { carrierHint = name; s = s.replace(re, ' '); break }
  }
  const compact = s.replace(/[^A-Za-z0-9]/g, '')
  if (compact.length < 8 || compact.length > 40) return { code: null, carrierHint }
  return { code: compact, carrierHint }
}

/** Register a tracking number — carrier auto-detected, hint used as fallback. */
export async function createTracker(trackingCode: string): Promise<TrackerInfo | null> {
  if (!API_KEY) return null
  const { code, carrierHint } = extractTrackingCode(trackingCode)
  if (!code) return null

  const attempt = async (body: Record<string, unknown>) => {
    const res = await fetch(`${BASE}/trackers`, {
      method: 'POST',
      headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracker: body }),
    })
    if (!res.ok) {
      console.error('[easypost] createTracker failed', res.status, await res.text().catch(() => ''))
      return null
    }
    return parseTracker(await res.json())
  }

  try {
    const auto = await attempt({ tracking_code: code })
    if (auto) return auto
    // Auto-detect failed — retry with the carrier the human wrote, if any
    if (carrierHint && ['USPS', 'UPS', 'FedEx'].includes(carrierHint)) {
      return await attempt({ tracking_code: code, carrier: carrierHint })
    }
    return null
  } catch (e) {
    console.error('[easypost] createTracker error', e)
    return null
  }
}

/** Fetch current state of an existing tracker. */
export async function getTracker(trackerId: string): Promise<TrackerInfo | null> {
  if (!API_KEY) return null
  try {
    const res = await fetch(`${BASE}/trackers/${trackerId}`, {
      headers: { Authorization: authHeader() },
    })
    if (!res.ok) return null
    return parseTracker(await res.json())
  } catch {
    return null
  }
}

/** Human label for a tracker status. */
export const TRACKING_LABELS: Record<string, string> = {
  pre_transit: 'Label created',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  available_for_pickup: 'Ready for pickup',
  return_to_sender: 'Returning to sender',
  failure: 'Delivery problem',
  cancelled: 'Cancelled',
  error: 'Tracking error',
  unknown: 'Tracking…',
}
