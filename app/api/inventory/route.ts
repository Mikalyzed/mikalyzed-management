import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') || '100')
  const offset = parseInt(searchParams.get('offset') || '0')

  const where: any = { isActive: true }
  if (status && status !== 'all') where.status = status

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

  const [vehicles, total, counts] = await Promise.all([
    prisma.inventoryVehicle.findMany({
      where,
      orderBy: { dateInStock: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.inventoryVehicle.count({ where }),
    prisma.inventoryVehicle.groupBy({
      by: ['status'],
      where: search
        ? { isActive: true, OR: where.OR }
        : { isActive: true },
      _count: true,
    }),
  ])

  const countsByStatus: Record<string, number> = {}
  let allCount = 0
  for (const c of counts) {
    countsByStatus[c.status] = c._count
    allCount += c._count
  }
  countsByStatus.all = allCount

  return NextResponse.json({ vehicles, total, counts: countsByStatus })
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

        const existing = await prisma.inventoryVehicle.findUnique({
          where: { stockNumber: stock },
          select: { status: true },
        })

        // On re-import: if vehicle was manually marked sold/removed, DON'T touch status.
        // If it was removed and is now back in the feed, revive it with initialStatus.
        const nextStatus =
          !existing ? initialStatus
          : existing.status === 'sold' ? existing.status
          : existing.status === 'removed' ? initialStatus
          : initialStatus

        await prisma.inventoryVehicle.upsert({
          where: { stockNumber: stock },
          update: {
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
          },
          create: {
            stockNumber: stock,
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
          },
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
      const stale = await prisma.inventoryVehicle.updateMany({
        where: {
          isActive: true,
          status: { in: ['in_stock', 'in_recon', 'external_repair'] },
          stockNumber: { notIn: Array.from(csvStocks) },
        },
        data: { status: 'sold' },
      })
      markedRemoved = stale.count
    }

    return NextResponse.json({ imported, skipped, errors, markedSold: markedRemoved })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
