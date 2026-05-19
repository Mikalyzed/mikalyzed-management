export type ChecklistField = { key: string; label: string }

/**
 * Default sub-fields for each structured checklist type. A template item
 * may override these by saving its own `fields` array. The mechanic-schedule
 * renderer and the Settings preview both pull from here for the default.
 *
 * Keep keys stable — they're persisted on stage checklists as data values.
 */
export const DEFAULT_FIELDS: Record<string, ChecklistField[]> = {
  tirePsi: [
    { key: 'fl', label: 'Front Left' },
    { key: 'fr', label: 'Front Right' },
    { key: 'rl', label: 'Rear Left' },
    { key: 'rr', label: 'Rear Right' },
  ],
  brakePads: [
    { key: 'frontMm', label: 'Front pads' },
    { key: 'rearMm', label: 'Rear pads' },
  ],
  fluids: [
    { key: 'powerSteering', label: 'Power steering fluid' },
    { key: 'brake', label: 'Brake fluid' },
    { key: 'engineOil', label: 'Engine oil' },
    { key: 'transmission', label: 'Transmission fluid' },
    { key: 'antifreeze', label: 'Antifreeze' },
  ],
  engineCheck: [
    { key: 'sparkPlug', label: 'Spark plug' },
    { key: 'coil', label: 'Coil' },
    { key: 'distributorCap', label: 'Distributor cap' },
    { key: 'sparkPlugWires', label: 'Spark plug wires' },
  ],
  electrical: [
    { key: 'regularBeam', label: 'Regular beam' },
    { key: 'highBeam', label: 'High beam' },
    { key: 'fogLights', label: 'Fog lights' },
    { key: 'radio', label: 'Radio' },
    { key: 'top', label: 'Top (if it has one)' },
    { key: 'brakeLights', label: 'Brake lights' },
    { key: 'reverseLights', label: 'Reverse lights' },
    { key: 'turnSignals', label: 'Turn signals' },
  ],
  steeringCheck: [{ key: 'play', label: 'Play in the steering' }],
  suspensionCheck: [
    { key: 'shaking', label: 'Shaking' },
    { key: 'noises', label: 'Noises' },
  ],
}

export function fieldsForItem(item: { type?: string; fields?: ChecklistField[] }): ChecklistField[] {
  if (item.fields && item.fields.length > 0) return item.fields
  if (item.type && DEFAULT_FIELDS[item.type]) return DEFAULT_FIELDS[item.type]
  return []
}
