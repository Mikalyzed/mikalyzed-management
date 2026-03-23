export const STAGES = ['mechanic', 'detailing', 'content', 'publish'] as const
export type Stage = (typeof STAGES)[number]

export const STAGE_ORDER: Record<Stage, number> = {
  mechanic: 0,
  detailing: 1,
  content: 2,
  publish: 3,
}

export const NEXT_STAGE: Record<Stage, Stage | 'completed'> = {
  mechanic: 'detailing',
  detailing: 'content',
  content: 'publish',
  publish: 'completed',
}

export const STAGE_LABELS: Record<Stage | 'completed', string> = {
  mechanic: 'Mechanic',
  detailing: 'Detailing',
  content: 'Content',
  publish: 'Publish',
  completed: 'Completed',
}

export const STAGE_COLORS: Record<Stage | 'completed', string> = {
  mechanic: 'badge-mechanic',
  detailing: 'badge-detailing',
  content: 'badge-content',
  publish: 'badge-publish',
  completed: 'badge-completed',
}

export const DEFAULT_CHECKLISTS: Record<Stage, string[]> = {
  mechanic: [
    'Oil & fluids check',
    'Brake inspection',
    'Tire condition',
    'Engine check',
    'AC system',
    'Electrical systems',
    'Test drive',
    'Body assessment',
  ],
  detailing: [
    'Exterior wash',
    'Interior cleaning',
    'Polish / wax',
    'Tire shine',
    'Glass cleaning',
    'Odor check',
  ],
  content: [
    'Exterior photos (8+)',
    'Interior photos (6+)',
    'Feature highlights',
    'Video walkaround',
  ],
  publish: [
    'Listing created',
    'Photos uploaded',
    'Price set',
    'Live confirmed',
  ],
}

export const ROLES = ['admin', 'mechanic', 'detailer', 'content', 'sales', 'coordinator'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  mechanic: 'Mechanic',
  detailer: 'Detailer',
  content: 'Content',
  sales: 'Sales',
  coordinator: 'Coordinator',
}
