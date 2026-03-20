export const LEAD_SOURCES = [
  'website', 'meta_ad', 'phone_call', 'walk_in', 'referral', 'other',
] as const
export type LeadSource = (typeof LEAD_SOURCES)[number]

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  website: 'Website',
  meta_ad: 'Meta Ad',
  phone_call: 'Phone Call',
  walk_in: 'Walk-In',
  referral: 'Referral',
  other: 'Other',
}

export const LEAD_SOURCE_COLORS: Record<LeadSource, string> = {
  website: '#2563eb',
  meta_ad: '#7c3aed',
  phone_call: '#059669',
  walk_in: '#d97706',
  referral: '#0891b2',
  other: '#6b7280',
}

export const LOST_REASONS = [
  'price', 'financing', 'found_elsewhere', 'no_response', 'not_ready', 'wrong_vehicle', 'other',
] as const
export type LostReason = (typeof LOST_REASONS)[number]

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  price: 'Price Too High',
  financing: 'Financing Issue',
  found_elsewhere: 'Found Elsewhere',
  no_response: 'No Response',
  not_ready: 'Not Ready to Buy',
  wrong_vehicle: 'Wrong Vehicle',
  other: 'Other',
}

export const STAGE_TYPES = ['open', 'won', 'lost'] as const

export const DEFAULT_PIPELINES = [
  {
    name: 'Vehicle Sales',
    color: '#3b82f6',
    stages: [
      { name: 'New Lead', type: 'open' },
      { name: 'Contacted', type: 'open' },
      { name: 'Appointment Set', type: 'open' },
      { name: 'Showed Up', type: 'open' },
      { name: 'Negotiating', type: 'open' },
      { name: 'Sold', type: 'won' },
      { name: 'Lost', type: 'lost' },
    ],
  },
  {
    name: 'The Reserve',
    color: '#8b5cf6',
    stages: [
      { name: 'New Inquiry', type: 'open' },
      { name: 'Contacted', type: 'open' },
      { name: 'Quote Sent', type: 'open' },
      { name: 'Follow Up', type: 'open' },
      { name: 'Reserved', type: 'won' },
      { name: 'Lost', type: 'lost' },
    ],
  },
  {
    name: 'Acquisition / Consignment',
    color: '#059669',
    stages: [
      { name: 'New Lead', type: 'open' },
      { name: 'Contacted', type: 'open' },
      { name: 'Appraisal Requested', type: 'open' },
      { name: 'Numbers Reviewed', type: 'open' },
      { name: 'Offer Sent', type: 'open' },
      { name: 'Follow Up', type: 'open' },
      { name: 'Acquired', type: 'won' },
      { name: 'Lost', type: 'lost' },
    ],
  },
]

export const ACTIVITY_TYPES = [
  'lead_created', 'stage_changed', 'assigned', 'note_added',
  'task_created', 'task_completed', 'call_logged',
  'sms_sent', 'sms_received', 'email_sent', 'appointment_set',
] as const

export const ACTIVITY_LABELS: Record<string, string> = {
  lead_created: 'Lead Created',
  stage_changed: 'Stage Changed',
  assigned: 'Assigned',
  note_added: 'Note Added',
  task_created: 'Task Created',
  task_completed: 'Task Completed',
  call_logged: 'Call Logged',
  sms_sent: 'SMS Sent',
  sms_received: 'SMS Received',
  email_sent: 'Email Sent',
  appointment_set: 'Appointment Set',
}
