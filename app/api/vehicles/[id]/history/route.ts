import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Get vehicle to verify it exists and get stock number
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    select: { stockNumber: true, returnQueue: true }
  })

  if (!vehicle) {
    return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
  }

  // Get all stages for this vehicle (including completed/skipped)
  const stages = await prisma.vehicleStage.findMany({
    where: { vehicleId: id },
    include: {
      assignee: { select: { id: true, name: true } }
    },
    orderBy: { startedAt: 'asc' }
  })

  // Get parts history for this vehicle
  const parts = await prisma.part.findMany({
    where: { vehicleId: id },
    include: {
      requestedBy: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } }
    },
    orderBy: { createdAt: 'asc' }
  })

  // Get external repairs by stock number
  const externalRepairs = await prisma.externalRepair.findMany({
    where: { stockNumber: vehicle.stockNumber },
    orderBy: { sentDate: 'asc' }
  })

  // Get activity logs for this vehicle
  const activityLogs = await prisma.activityLog.findMany({
    where: {
      entityType: 'vehicle',
      entityId: id
    },
    include: {
      actor: { select: { id: true, name: true } }
    },
    orderBy: { createdAt: 'asc' }
  })

  // Also get part-related activity logs
  const partActivityLogs = await prisma.activityLog.findMany({
    where: {
      entityType: 'part',
      details: {
        path: ['vehicleStockNumber'],
        equals: vehicle.stockNumber
      }
    },
    include: {
      actor: { select: { id: true, name: true } }
    },
    orderBy: { createdAt: 'asc' }
  })

  // Combine and create timeline events
  const events: any[] = []

  // Add stage events
  stages.forEach(stage => {
    const completedTasks = Array.isArray(stage.checklist) 
      ? (stage.checklist as any[]).filter(c => c.done).length 
      : 0
    const totalTasks = Array.isArray(stage.checklist) 
      ? (stage.checklist as any[]).length 
      : 0

    events.push({
      type: 'stage',
      date: stage.startedAt,
      title: `${stage.stage.charAt(0).toUpperCase() + stage.stage.slice(1)} Stage`,
      status: stage.status,
      details: {
        assignee: stage.assignee?.name || 'Unassigned',
        duration: stage.completedAt ? 
          Math.floor((new Date(stage.completedAt).getTime() - new Date(stage.startedAt).getTime()) / 3600000) : null,
        completedTasks,
        totalTasks,
        skipped: stage.status === 'skipped'
      }
    })
  })

  // Add parts events
  parts.forEach(part => {
    events.push({
      type: 'part',
      date: part.createdAt,
      title: `Part Requested: ${part.name}`,
      status: 'requested',
      details: {
        partName: part.name,
        url: part.url,
        requestedBy: part.requestedBy.name,
        assignedTo: part.assignedTo?.name,
        currentStatus: part.status
      }
    })
    
    // Add status change events based on updatedAt if different from createdAt
    if (part.status !== 'requested' && part.updatedAt !== part.createdAt) {
      events.push({
        type: 'part',
        date: part.updatedAt,
        title: `Part ${part.status.charAt(0).toUpperCase() + part.status.slice(1)}: ${part.name}`,
        status: part.status,
        details: {
          partName: part.name,
          url: part.url,
          currentStatus: part.status
        }
      })
    }
  })

  // Add external repair events
  externalRepairs.forEach(repair => {
    events.push({
      type: 'external',
      date: repair.sentDate,
      title: `Sent to External Repair`,
      status: 'sent',
      details: {
        shopName: repair.shopName,
        repairDescription: repair.repairDescription,
        estimatedDays: repair.estimatedDays,
        currentStatus: repair.status
      }
    })
    
    if (repair.status === 'returned' && repair.updatedAt !== repair.createdAt) {
      events.push({
        type: 'external',
        date: repair.updatedAt,
        title: `Returned from External Repair`,
        status: 'returned',
        details: {
          shopName: repair.shopName,
          repairDescription: repair.repairDescription
        }
      })
    }
  })

  // Add activity log events (filtered for important ones)
  activityLogs.forEach(log => {
    if (['vehicle_created', 'stage_moved', 'status_changed'].includes(log.action)) {
      events.push({
        type: 'activity',
        date: log.createdAt,
        title: getActivityTitle(log.action, log.details),
        status: log.action,
        details: {
          actor: log.actor?.name || 'System',
          action: log.action,
          details: log.details
        }
      })
    }
  })

  // Add part activity logs
  partActivityLogs.forEach(log => {
    if (['part_ordered', 'part_received'].includes(log.action)) {
      events.push({
        type: 'part',
        date: log.createdAt,
        title: `Part ${log.action.split('_')[1]}: ${(log.details as any)?.partName || 'Unknown part'}`,
        status: log.action.split('_')[1],
        details: {
          partName: (log.details as any)?.partName,
          actor: log.actor?.name || 'System'
        }
      })
    }
  })

  // Sort all events chronologically
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Append queued return entries at the end (future events)
  const returnQueue = (vehicle.returnQueue as any[]) || []
  returnQueue.forEach((r: any) => {
    events.push({
      type: 'queued_return',
      date: new Date().toISOString(),
      title: `Queued Return to ${(r.stage || '').charAt(0).toUpperCase() + (r.stage || '').slice(1)}`,
      status: 'queued',
      details: {
        fromStage: r.fromStage,
        toStage: r.stage,
        reason: r.reason || null,
        uncompletedTasks: r.uncompletedTasks || [],
      },
    })
  })

  return NextResponse.json({ events })
}

function getActivityTitle(action: string, details: any): string {
  switch (action) {
    case 'vehicle_created':
      return 'Vehicle Added to System'
    case 'stage_moved':
      return `Moved from ${details?.from || 'Unknown'} to ${details?.to || 'Unknown'}`
    case 'status_changed':
      return `Status Changed`
    default:
      return action.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
  }
}