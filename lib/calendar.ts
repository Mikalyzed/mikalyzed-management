export const CALENDAR_TYPES = [
  'mechanic_visit',
  'sales_meeting',
  'pickup',
  'dropoff',
  'detailing',
  'content_shoot',
  'event_task',
  'errand',
] as const
export type CalendarType = (typeof CALENDAR_TYPES)[number]

export const CALENDAR_TYPE_LABELS: Record<CalendarType, string> = {
  mechanic_visit: 'Mechanic Visit',
  sales_meeting: 'Sales Meeting',
  pickup: 'Pickup',
  dropoff: 'Dropoff',
  detailing: 'Detailing',
  content_shoot: 'Content Shoot',
  event_task: 'Event Task',
  errand: 'Errand',
}

export const CALENDAR_TYPE_COLORS: Record<CalendarType, string> = {
  mechanic_visit: '#9333ea',
  sales_meeting: '#2563eb',
  pickup: '#ea580c',
  dropoff: '#ea580c',
  detailing: '#0891b2',
  content_shoot: '#d97706',
  event_task: '#65a30d',
  errand: '#6b7280',
}

export const CALENDAR_STATUSES = [
  'scheduled',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'rescheduled',
] as const
export type CalendarStatus = (typeof CALENDAR_STATUSES)[number]

export const CALENDAR_STATUS_LABELS: Record<CalendarStatus, string> = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled',
}
