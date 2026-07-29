/**
 * Shared part-display vocabulary — one source for the parts page, the
 * dashboard's part modal, and anywhere else a part status gets rendered.
 */

export type PartRecord = {
  id: string
  name: string
  url: string | null
  status: string
  price: string | null
  tracking: string | null
  trackingStatus: string | null
  trackingCarrier: string | null
  expectedDelivery: string | null
  orderImage: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  vehicle: {
    id: string
    stockNumber: string
    year: number | null
    make: string
    model: string
    color: string | null
  }
  requestedBy: { id: string; name: string }
  assignedTo: { id: string; name: string } | null
}

export const PART_STATUS_LABELS: Record<string, string> = {
  requested: 'Requested',
  sourced: 'Pending Approval',
  ready_to_order: 'Ready to Order',
  ordered: 'Ordered',
  received: 'Received',
}

export const PART_STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  requested: { bg: '#fef2f2', color: '#ef4444', border: '#fecaca' },
  sourced: { bg: '#fef9c3', color: '#a16207', border: '#fde047' },
  ready_to_order: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  ordered: { bg: '#fefce8', color: '#eab308', border: '#fde047' },
  received: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
}

export const PART_LIVE_LABELS: Record<string, string> = {
  pre_transit: 'Label created', in_transit: 'In transit', out_for_delivery: 'Out for delivery',
  delivered: 'Delivered', available_for_pickup: 'Ready for pickup', return_to_sender: 'Returning to sender',
  failure: 'Delivery problem', cancelled: 'Cancelled', error: 'Tracking error', unknown: 'Tracking…',
}

export const PART_LIVE_COLORS: Record<string, string> = {
  delivered: '#16a34a', available_for_pickup: '#16a34a', out_for_delivery: '#2563eb', in_transit: '#2563eb',
  pre_transit: '#6b6b6b', return_to_sender: '#dc2626', failure: '#dc2626', error: '#dc2626',
}
