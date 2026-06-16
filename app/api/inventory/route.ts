import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { presignGet } from '@/lib/r2'
import { getInventoryList, getInventoryCount, getInventoryGroupByStatus, findInventoryByStockNumber } from '@/lib/dms/vehicle/canonical-reader'
import { upsertInventoryRecord, markStaleInventoryAsSold } from '@/lib/dms/vehicle/canonical-writer'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') || '100')
  const offset = parseInt(searchParams.get('offset') || '0')

  const where: any = { isActive: true }
  if (status && status !== 'all') {
    where.status = status
  } else if (!search) {
    // Default 'all' view excludes sold/removed — those live in their own tabs.
    // BUT when the user is explicitly searching by stock # / VIN / name, we
    // want every matching record so an admin can find a sold car they need
    // to send back through recon.  No exclusion if a search query is present.
    where.status = { notIn: ['sold', 'removed'] }
  }

  if (search) {
    const q = search.trim()
    where.OR = [
      { stockNumber: { contains: q, mode: 'insensitive' } },
      { vin: { contains: q, mode: 'insensitive' } },
      { make: { contains: q, mode: 'insensitive' } },
      { model: { contains: q, mode: 'insensitive' } },
      { vehicleInfo: { contains: q, mode: 'insensitive' } },
      { color: { contains: q, mode: 'insensitive' } },
    ]
  }

  // When the user is searching and no specific status is requested, fetch
  // non-sold and sold matches separately so non-sold cars always appear at
  // the top of the suggestion list — sold/removed match get pushed to the
  // bottom so the picker isn't dominated by historical inventory.  Other
  // cases keep the existing single-query behavior.
  const sortSoldLast = !!search && (!status || status === 'all')
  const [vehicles, total, counts] = await Promise.all([
    sortSoldLast
      ? Promise.all([
          getInventoryList({
            where: { ...where, status: { notIn: ['sold', 'removed'] } },
            orderBy: { dateInStock: 'desc' },
            take: limit,
            skip: offset,
          }),
          getInventoryList({
            where: { ...where, status: { in: ['sold', 'removed'] } },
            orderBy: { dateInStock: 'desc' },
            take: limit,
            skip: offset,
          }),
        ]).then(([active, soldOrRemoved]) => [...active, ...soldOrRemoved].slice(0, limit))
      : getInventoryList({
          where,
          orderBy: { dateInStock: 'desc' },
          take: limit,
          skip: offset,
        }),
    getInventoryCount(where),
    getInventoryGroupByStatus(
      search ? { isActive: true, OR: where.OR } : { isActive: true },
    ),
  ])

  const countsByStatus: Record<string, number> = {}
  let allCount = 0
  for (const c of counts) {
    countsByStatus[c.status] = c._count
    if (c.status !== 'sold' && c.status !== 'removed') allCount += c._count
  }
  countsByStatus.all = allCount

  // Hero-photo enrichment — pull the first photo from the canonical Vehicle for each
  // inventory row (matched by stockNumber) so the ledger can render a 16:9 thumbnail.
  // Hardened so a media-join or R2 failure can't take down the whole inventory page.
  const heroByStock = new Map<string, string>()
  try {
    const stockNumbers = vehicles.map(v => v.stockNumber).filter(Boolean)
    if (stockNumbers.length > 0) {
      const vehiclesWithMedia = await prisma.vehicle.findMany({
        where: { stockNumber: { in: stockNumbers } },
        select: {
          stockNumber: true,
          mediaAssets: {
            where: { type: { in: ['exterior', 'interior', 'undercarriage'] } },
            orderBy: [{ sortOrder: 'asc' }, { uploadedAt: 'desc' }],
            take: 1,
            select: { r2Key: true },
          },
        },
      })
      await Promise.all(vehiclesWithMedia.map(async (v) => {
        const hero = v.mediaAssets[0]
        if (!hero) return
        try {
          const url = await presignGet(hero.r2Key, 60 * 60)
          heroByStock.set(v.stockNumber, url)
        } catch (presignErr) {
          console.warn(`[inventory] presign failed for ${v.stockNumber}:`, presignErr)
        }
      }))
    }
  } catch (enrichErr) {
    console.error('[inventory] hero enrichment failed (returning rows without heroUrl):', enrichErr)
  }

  // Per-row "is this car actively in recon AND/OR at external repair" flags.
  // The InventoryVehicle.status is single-valued (priority: external > recon >
  // in_stock), so the badge can't show both states.  These boolean flags let
  // the card render two chips when both apply (e.g., car is at the external
  // shop AND a mechanic stage is still live on the recon board).
  const reconStockSet = new Set<string>()
  const externalStockSet = new Set<string>()
  try {
    const stockNumbers = vehicles.map(v => v.stockNumber).filter(Boolean)
    if (stockNumbers.length > 0) {
      const [activeReconRows, activeExternalRows] = await Promise.all([
        prisma.vehicle.findMany({
          where: {
            stockNumber: { in: stockNumbers },
            status: { notIn: ['completed', 'inventory_only', 'archived'] },
            stages: { some: { status: { notIn: ['done', 'skipped'] } } },
          },
          select: { stockNumber: true },
        }),
        prisma.externalRepair.findMany({
          where: {
            stockNumber: { in: stockNumbers },
            status: { not: 'returned' },
          },
          select: { stockNumber: true },
        }),
      ])
      for (const r of activeReconRows) reconStockSet.add(r.stockNumber)
      for (const r of activeExternalRows) externalStockSet.add(r.stockNumber)
    }
  } catch (flagsErr) {
    console.warn('[inventory] recon/external flag enrichment failed:', flagsErr)
  }

  const enriched = vehicles.map(v => ({
    ...v,
    heroUrl: heroByStock.get(v.stockNumber) || null,
    inRecon: reconStockSet.has(v.stockNumber),
    atExternal: externalStockSet.has(v.stockNumber),
  }))

  return NextResponse.json({ vehicles: enriched, total, counts: countsByStatus })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { action, ...data } = await req.json()

  if (action === 'import') {
    const { rows } = data
    if (!Array.isArray(rows)) return NextResponse.json({ error: 'rows array required' }, { status: 400 })

    let imported = 0
    let skipped = 0
    let errors = 0
    let markedRemoved = 0

    // Cross-reference existing recon (Vehicle) + external repair records
    const [activeRecon, activeExternal] = await Promise.all([
      prisma.vehicle.findMany({
        where: { completedAt: null },
        select: { stockNumber: true },
      }),
      prisma.externalRepair.findMany({
        where: { status: { not: 'returned' } },
        select: { stockNumber: true },
      }),
    ])
    const reconStocks = new Set(activeRecon.map(v => v.stockNumber))
    const externalStocks = new Set(activeExternal.map(v => v.stockNumber))
    const csvStocks = new Set<string>()

    for (const row of rows) {
      try {
        if (!row.stockNumber?.trim()) { skipped++; continue }

        const stock = row.stockNumber.trim()
        csvStocks.add(stock)
        const initialStatus = externalStocks.has(stock)
          ? 'external_repair'
          : reconStocks.has(stock)
            ? 'in_recon'
            : 'in_stock'

        // Parse year, make, model from VehicleInfo
        const info = row.vehicleInfo?.trim() || ''
        const yearMatch = info.match(/^(\d{4})\s+/)
        const year = yearMatch ? parseInt(yearMatch[1]) : null

        // After year, extract make and model
        let make = ''
        let model = ''
        if (yearMatch) {
          const rest = info.slice(yearMatch[0].length).trim()
          const parts = rest.split(/\s+/)
          make = parts[0] || ''
          model = parts.slice(1).join(' ') || ''
        }

        const existing = await findInventoryByStockNumber(stock, {
          select: { status: true },
        }) as { status: string } | null

        // On re-import: if vehicle was manually marked sold/removed, DON'T touch status.
        // If it was removed and is now back in the feed, revive it with initialStatus.
        const nextStatus =
          !existing ? initialStatus
          : existing.status === 'sold' ? existing.status
          : existing.status === 'removed' ? initialStatus
          : initialStatus

        const sharedPayload = {
          vin: row.vin?.trim() || null,
          vehicleInfo: info,
          year,
          make,
          model,
          color: row.color?.trim() || null,
          mileage: row.mileage ? parseInt(row.mileage) || null : null,
          location: row.location?.trim() || null,
          askingPrice: row.askingPrice ? parseFloat(row.askingPrice) || null : null,
          vehicleCost: row.vehicleCost ? parseFloat(row.vehicleCost) || null : null,
          purchaseType: row.purchaseType?.trim() || null,
          purchasedFrom: row.purchasedFrom?.trim() || null,
          titleStatus: row.titleStatus?.trim() || null,
          dateInStock: row.dateInStock ? new Date(row.dateInStock) : null,
          status: nextStatus,
        }
        await upsertInventoryRecord({
          stockNumber: stock,
          update: sharedPayload,
          create: sharedPayload,
        })
        imported++
      } catch (e: any) {
        console.error('Import error for row:', row.stockNumber, e.message)
        errors++
      }
    }

    // Reconcile: any active inventory vehicle NOT in the current CSV → mark as sold
    // (DealerCenter removes a vehicle from its export when it's sold)
    if (csvStocks.size > 0) {
      const stale = await markStaleInventoryAsSold({
        activeStockNumbers: Array.from(csvStocks),
        alsoInStatuses: ['in_stock', 'in_recon', 'external_repair'],
      })
      markedRemoved = stale.count
    }

    return NextResponse.json({ imported, skipped, errors, markedSold: markedRemoved })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
