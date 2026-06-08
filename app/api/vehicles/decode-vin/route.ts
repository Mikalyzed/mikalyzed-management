import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'

/**
 * GET /api/vehicles/decode-vin?vin=...
 *
 * Decodes a VIN using NHTSA vPIC — the US Department of Transportation's free,
 * unauthenticated VIN decoder. No API key, no rate limits we need to worry about.
 * Returns ONLY fields the decoder actually populated; never invents data.
 *
 * https://vpic.nhtsa.dot.gov/api/
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const rawVin = (searchParams.get('vin') || '').trim().toUpperCase()
  // VINs are 11–17 alphanumeric (no I, O, Q for modern VINs; older formats are looser).
  if (!/^[A-HJ-NPR-Z0-9]{11,17}$/.test(rawVin)) {
    return NextResponse.json({ error: 'Invalid VIN format' }, { status: 400 })
  }

  try {
    const upstream = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(rawVin)}?format=json`,
      // vPIC is fast (~150ms) but cap at 8s in case they're slow.
      { signal: AbortSignal.timeout(8000) },
    )
    if (!upstream.ok) {
      return NextResponse.json({ error: `Decoder upstream returned ${upstream.status}` }, { status: 502 })
    }
    const body = await upstream.json()
    const r = body?.Results?.[0]
    if (!r || typeof r !== 'object') {
      return NextResponse.json({ error: 'Decoder returned no results' }, { status: 502 })
    }

    // Helpers — vPIC stuffs empty/null fields with various sentinels; filter them out.
    const trash = new Set(['', 'null', 'Not Applicable', '/', '-', '0', 'UNKNOWN', 'Unknown'])
    const g = (k: string): string | null => {
      const val = r[k]
      if (val === undefined || val === null) return null
      const s = String(val).trim()
      if (trash.has(s)) return null
      return s
    }
    const num = (k: string): number | null => {
      const s = g(k)
      if (!s) return null
      const n = parseInt(s, 10)
      return Number.isFinite(n) ? n : null
    }

    // vPIC sometimes returns an ErrorCode like "1" with text "VIN corrected" — that's
    // fine. "11" or "12" mean the VIN didn't decode at all; surface that as an error.
    const errorCode = g('ErrorCode')
    if (errorCode && /^(?:11|12|14)$/.test(errorCode)) {
      return NextResponse.json({
        error: g('ErrorText') || 'VIN could not be decoded',
        errorCode,
      }, { status: 422 })
    }

    // Build human-readable engine + transmission strings out of the granular fields.
    const buildEngine = () => {
      const disp = g('DisplacementL')
      const config = g('EngineConfiguration')
      const cyl = g('EngineCylinders')
      const model = g('EngineModel')
      const parts: string[] = []
      if (disp) parts.push(`${parseFloat(disp).toFixed(1)}L`)
      if (config && cyl) parts.push(`${config[0].toUpperCase()}${cyl}`) // e.g. "V8"
      else if (cyl) parts.push(`${cyl}cyl`)
      if (model && !parts.includes(model)) parts.push(model)
      return parts.length ? parts.join(' ') : null
    }
    const buildTransmission = () => {
      const speeds = g('TransmissionSpeeds')
      const style = g('TransmissionStyle')
      if (speeds && style) return `${speeds}-Speed ${style}`
      return speeds ? `${speeds}-Speed` : style ?? null
    }

    const decoded = {
      vin: rawVin,
      year:         num('ModelYear'),
      make:         g('Make'),
      model:        g('Model'),
      trim:         g('Trim') || g('Series'),
      bodyType:     g('BodyClass'),
      vehicleType:  g('VehicleType'),
      engine:       buildEngine(),
      cylinder:     num('EngineCylinders'),
      transmission: buildTransmission(),
      driveTrain:   g('DriveType'),
      fuelType:     g('FuelTypePrimary'),
      horsepower:   num('EngineHP'),
      doors:        num('Doors'),
      // Extras worth surfacing later if we want more depth
      plant:        g('PlantCountry'),
      gvwr:         g('GVWR'),
      series:       g('Series'),
    }

    return NextResponse.json({ decoded })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[decode-vin] error:', msg)
    return NextResponse.json({ error: 'VIN decode failed: ' + msg }, { status: 500 })
  }
}
