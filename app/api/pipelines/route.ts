import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { DEFAULT_PIPELINES } from '@/lib/crm'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pipelines = await prisma.pipeline.findMany({
    where: { isActive: true },
    include: {
      stages: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { opportunities: true } },
    },
    orderBy: { sortOrder: 'asc' },
  })

  // Seed defaults if none exist
  if (pipelines.length === 0) {
    for (let i = 0; i < DEFAULT_PIPELINES.length; i++) {
      const p = DEFAULT_PIPELINES[i]
      await prisma.pipeline.create({
        data: {
          name: p.name,
          color: p.color,
          sortOrder: i,
          stages: {
            create: p.stages.map((s, j) => ({
              name: s.name,
              type: s.type,
              sortOrder: j,
            })),
          },
        },
      })
    }
    // Re-fetch
    const seeded = await prisma.pipeline.findMany({
      where: { isActive: true },
      include: {
        stages: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { opportunities: true } },
      },
      orderBy: { sortOrder: 'asc' },
    })
    return NextResponse.json(seeded)
  }

  return NextResponse.json(pipelines)
}

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = await request.json()
  const { name, color, stages } = body

  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const maxPipeline = await prisma.pipeline.findFirst({ orderBy: { sortOrder: 'desc' } })

  const pipeline = await prisma.pipeline.create({
    data: {
      name,
      color: color || '#3b82f6',
      sortOrder: (maxPipeline?.sortOrder ?? -1) + 1,
      stages: stages?.length ? {
        create: stages.map((s: { name: string; type?: string }, i: number) => ({
          name: s.name,
          type: s.type || 'open',
          sortOrder: i,
        })),
      } : undefined,
    },
    include: { stages: { orderBy: { sortOrder: 'asc' } } },
  })

  return NextResponse.json(pipeline, { status: 201 })
}
