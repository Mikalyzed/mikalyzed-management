export const EVENT_TYPES = [
  'car_show',
  'rally',
  'dealership_event',
  'content_day',
  'promotion',
  'popup',
  'giveaway',
  'sponsor',
  'private_showing',
  'launch',
] as const
export type EventType = (typeof EVENT_TYPES)[number]

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  car_show: 'Car Show',
  rally: 'Rally',
  dealership_event: 'Dealership Event',
  content_day: 'Content Day',
  promotion: 'Promotion',
  popup: 'Pop-Up',
  giveaway: 'Giveaway',
  sponsor: 'Sponsor Event',
  private_showing: 'Private Showing',
  launch: 'Launch Event',
}

export const EVENT_STATUSES = ['draft', 'planned', 'active', 'completed', 'cancelled'] as const
export type EventStatus = (typeof EVENT_STATUSES)[number]

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: 'Draft',
  planned: 'Planned',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const TASK_STATUSES = ['pending', 'in_progress', 'completed'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const SUGGESTED_SECTIONS = [
  'Marketing',
  'Logistics',
  'Vehicles',
  'Setup',
  'Staffing',
  'Content',
  'Follow-up',
]
