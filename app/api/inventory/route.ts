import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')
  const limit = parseInt(searchParams.get('limit') || '100')
  const offset = parseInt(searchParams.get('offset') || '0')

  const where: any = { isActive: true }

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

  const [vehicles, total] = await Promise.all([
    prisma.inventoryVehicle.findMany({
      where,
      orderBy: { dateInStock: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.inventoryVehicle.count({ where }),
  ])

  return NextResponse.json({ vehicles, total })
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

    for (const row of rows) {
      try {
        if (!row.stockNumber?.trim()) { skipped++; continue }

        const stock = row.stockNumber.trim()
        const status = externalStocks.has(stock)
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

        await prisma.inventoryVehicle.upsert({
          where: { stockNumber: row.stockNumber.trim() },
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
            status,
          },
          create: {
            stockNumber: row.stockNumber.trim(),
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
            status,
          },
        })
        imported++
      } catch (e: any) {
        console.error('Import error for row:', row.stockNumber, e.message)
        errors++
      }
    }

    return NextResponse.json({ imported, skipped, errors })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
