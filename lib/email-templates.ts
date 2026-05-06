const BASE_URL = 'https://mikalyzed-management.vercel.app'

function layout(content: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:32px 16px">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="height:4px;background:#dffd6e"></td></tr>
<tr><td style="padding:32px 24px">
${content}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e5e5e5;text-align:center">
<p style="margin:0;font-size:12px;color:#86868b">Mikalyzed Auto Boutique — Management System</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

function vehicleBox(text: string) {
  return `<div style="background:#f5f5f7;border-radius:8px;padding:16px;margin:16px 0">
<p style="margin:0;font-size:15px;color:#1d1d1f;font-weight:600">${text}</p>
</div>`
}

function ctaButton(url: string, label: string) {
  return `<div style="text-align:center;margin:24px 0">
<a href="${url}" style="display:inline-block;background:#1d1d1f;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:500">${label}</a>
</div>`
}

export function stageAdvanceEmail({
  vehicleDesc,
  fromStage,
  toStage,
  assigneeName,
  vehicleId,
}: {
  vehicleDesc: string
  fromStage: string
  toStage: string
  assigneeName: string
  vehicleId: string
}) {
  const subject = `New vehicle ready: ${vehicleDesc} → ${toStage}`
  const html = layout(`
<h1 style="margin:0 0 8px;font-size:22px;color:#1d1d1f">You have a new vehicle to work on</h1>
<p style="margin:0 0 16px;font-size:15px;color:#86868b">Hi ${assigneeName}, a vehicle has moved to your stage.</p>
${vehicleBox(vehicleDesc)}
<p style="font-size:15px;color:#1d1d1f"><strong>${fromStage}</strong> → <strong>${toStage}</strong></p>
${ctaButton(`${BASE_URL}/vehicles/${vehicleId}`, 'View Vehicle')}
`)
  return { subject, html }
}

export function transportUpdateEmail({
  vehicleDesc,
  status,
  updatedBy,
  transportId,
}: {
  vehicleDesc: string
  status: string
  updatedBy: string
  transportId: string
}) {
  const subject = `Transport update: ${vehicleDesc} — ${status}`
  const html = layout(`
<h1 style="margin:0 0 8px;font-size:22px;color:#1d1d1f">Transport Status Updated</h1>
<p style="margin:0 0 16px;font-size:15px;color:#86868b">Updated by ${updatedBy}</p>
${vehicleBox(vehicleDesc)}
<p style="font-size:15px;color:#1d1d1f">New status: <strong>${status}</strong></p>
${ctaButton(`${BASE_URL}/transport`, 'View Transport')}
`)
  return { subject, html }
}

export function inspectionReportEmail({
  vehicleDesc,
  stockNumber,
  mechanicName,
  vehicleId,
  checklist,
  followUps,
}: {
  vehicleDesc: string
  stockNumber: string
  mechanicName: string
  vehicleId: string
  checklist: Array<{
    item: string
    done: boolean
    note?: string
    type?: string
    data?: Record<string, unknown>
  }>
  followUps: Array<{
    item: string
    estimatedHours?: number | null
    approved?: string
    done?: boolean
  }>
}) {
  const STATUS_COLORS: Record<string, string> = {
    ok: '#16a34a', no: '#16a34a', topped: '#2563eb',
    issue: '#dc2626', yes: '#dc2626',
  }
  const STATUS_LABELS: Record<string, string> = {
    ok: 'OK', topped: 'Topped Off', issue: 'Issue',
    no: 'No', yes: 'Yes',
  }

  const getStatus = (v: unknown): string | undefined => {
    if (!v) return undefined
    if (typeof v === 'string') return v
    if (typeof v === 'object' && v && 'status' in v) return (v as { status?: string }).status
    return undefined
  }
  const getNote = (v: unknown): string => {
    if (v && typeof v === 'object' && 'note' in v) return (v as { note?: string }).note || ''
    return ''
  }

  const pillRow = (key: string, label: string, data: Record<string, unknown>) => {
    const status = getStatus(data[key])
    const note = getNote(data[key])
    if (!status) return ''
    const color = STATUS_COLORS[status] || '#86868b'
    return `<tr>
      <td style="padding:4px 8px 4px 0;font-size:13px;color:#1d1d1f">${label}</td>
      <td style="padding:4px 0;text-align:right">
        <span style="display:inline-block;padding:2px 10px;border-radius:100px;background:${color}20;color:${color};font-size:11px;font-weight:700;text-transform:uppercase">${STATUS_LABELS[status] || status}</span>
      </td>
    </tr>${note ? `<tr><td colspan="2" style="padding:0 0 8px 0;font-size:12px;color:#86868b;font-style:italic">→ ${note}</td></tr>` : ''}`
  }

  const renderStructured = (item: { type?: string; data?: Record<string, unknown> }) => {
    const d = item.data || {}
    if (item.type === 'tirePsi') {
      const cells = ['fl', 'fr', 'rl', 'rr'].map(k => `<td style="padding:6px 8px;text-align:center;font-size:13px;color:#1d1d1f;background:#f5f5f7;border-radius:6px;width:60px">${d[k] ?? '—'}</td>`).join('<td style="width:6px"></td>')
      const labels = ['FL', 'FR', 'RL', 'RR'].map(l => `<td style="padding:0 8px 4px;text-align:center;font-size:11px;color:#86868b;font-weight:600">${l}</td>`).join('<td></td>')
      return `<table cellpadding="0" cellspacing="0" style="width:100%;margin-top:6px"><tr>${labels}</tr><tr>${cells}</tr></table>`
    }
    if (item.type === 'brakePads') {
      const front = d.frontMm ?? '—'
      const rear = d.rearMm ?? '—'
      return `<p style="margin:6px 0 0;font-size:13px;color:#1d1d1f">Front pads: <strong>${front}mm</strong> · Rear pads: <strong>${rear}mm</strong></p>`
    }
    if (item.type === 'fluids') {
      const rows = [
        ['powerSteering', 'Power steering'],
        ['brake', 'Brake'],
        ['engineOil', 'Engine oil'],
        ['transmission', 'Transmission'],
        ['antifreeze', 'Antifreeze'],
      ].map(([k, l]) => pillRow(k, l, d as Record<string, unknown>)).join('')
      return `<table cellpadding="0" cellspacing="0" style="width:100%;margin-top:6px">${rows}</table>`
    }
    if (item.type === 'engineCheck') {
      const rows = [
        ['sparkPlug', 'Spark plug'],
        ['coil', 'Coil'],
        ['distributorCap', 'Distributor cap'],
        ['sparkPlugWires', 'Spark plug wires'],
      ].map(([k, l]) => pillRow(k, l, d as Record<string, unknown>)).join('')
      return `<table cellpadding="0" cellspacing="0" style="width:100%;margin-top:6px">${rows}</table>`
    }
    if (item.type === 'electrical') {
      const rows = [
        ['regularBeam', 'Regular beam'],
        ['highBeam', 'High beam'],
        ['fogLights', 'Fog lights'],
        ['radio', 'Radio'],
        ['top', 'Top'],
        ['brakeLights', 'Brake lights'],
        ['reverseLights', 'Reverse lights'],
        ['turnSignals', 'Turn signals'],
      ].map(([k, l]) => pillRow(k, l, d as Record<string, unknown>)).join('')
      return `<table cellpadding="0" cellspacing="0" style="width:100%;margin-top:6px">${rows}</table>`
    }
    if (item.type === 'steeringCheck') {
      return `<table cellpadding="0" cellspacing="0" style="width:100%;margin-top:6px">${pillRow('play', 'Play in the steering', d as Record<string, unknown>)}</table>`
    }
    if (item.type === 'suspensionCheck') {
      const rows = [['shaking', 'Shaking'], ['noises', 'Noises']]
        .map(([k, l]) => pillRow(k, l, d as Record<string, unknown>)).join('')
      return `<table cellpadding="0" cellspacing="0" style="width:100%;margin-top:6px">${rows}</table>`
    }
    return ''
  }

  const inspectionItems = checklist.filter(c => !((c as { addedByMechanic?: boolean }).addedByMechanic))
  const doneCount = inspectionItems.filter(c => c.done).length

  const renderItem = (item: { item: string; done: boolean; note?: string; type?: string; data?: Record<string, unknown> }) => `
<div style="background:#ffffff;border:1px solid #e5e5e5;border-radius:10px;padding:14px 16px;margin:0 0 10px">
  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
    <span style="font-size:14px;font-weight:600;color:#1d1d1f">${item.item}</span>
    <span style="display:inline-block;padding:2px 10px;border-radius:100px;background:${item.done ? '#dcfce720' : '#f5f5f720'};color:${item.done ? '#16a34a' : '#86868b'};font-size:11px;font-weight:700">${item.done ? '✓ Done' : 'Not done'}</span>
  </div>
  ${renderStructured(item)}
  ${item.note ? `<p style="margin:8px 0 0;padding:8px 10px;background:#f5f5f7;border-radius:6px;font-size:12px;color:#1d1d1f"><strong style="color:#86868b">Notes:</strong> ${item.note}</p>` : ''}
</div>`

  const followUpRows = followUps.length > 0 ? `
<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;margin:16px 0">
  <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.04em">Follow-up Tasks Requested</p>
  ${followUps.map(f => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-top:1px solid #fde68a">
      <span style="font-size:13px;color:#1d1d1f">${f.item}</span>
      <span style="display:inline-flex;gap:6px">
        ${f.estimatedHours != null ? `<span style="padding:2px 8px;border-radius:100px;background:#fef3c7;color:#92400e;font-size:11px;font-weight:700">${f.estimatedHours}h</span>` : ''}
        <span style="padding:2px 8px;border-radius:100px;background:${f.approved === 'approved' ? '#dcfce7' : '#fef3c7'};color:${f.approved === 'approved' ? '#16a34a' : '#92400e'};font-size:11px;font-weight:700;text-transform:uppercase">${f.approved === 'approved' ? 'Approved' : 'Pending'}</span>
      </span>
    </div>
  `).join('')}
</div>` : ''

  const subject = `Inspection report: ${vehicleDesc}`
  const html = layout(`
<h1 style="margin:0 0 4px;font-size:22px;color:#1d1d1f">Vehicle Inspection Report</h1>
<p style="margin:0 0 16px;font-size:13px;color:#86868b">By ${mechanicName} · ${doneCount}/${inspectionItems.length} tasks complete</p>
${vehicleBox(`${vehicleDesc} · #${stockNumber}`)}
<div style="margin:16px 0">
  ${inspectionItems.map(renderItem).join('')}
</div>
${followUpRows}
${ctaButton(`${BASE_URL}/vehicles/${vehicleId}`, 'View Vehicle')}
`)
  return { subject, html }
}

export function newTransportRequestEmail({
  vehicleDesc,
  pickupLocation,
  deliveryLocation,
  trailerType,
  purpose,
  purposeNote,
  scheduledDate,
  carrierInfo,
  estimatedPrice,
  urgency,
  clientName,
  clientPhone,
  notes,
  status,
  requestedBy,
}: {
  vehicleDesc: string
  pickupLocation: string
  deliveryLocation: string
  trailerType: string | null
  purpose: string | null
  purposeNote: string | null
  scheduledDate: Date | null
  carrierInfo: string | null
  estimatedPrice: number | null
  urgency: string
  clientName: string | null
  clientPhone: string | null
  notes: string | null
  status: string
  requestedBy: string
}) {
  const purposeLabel = purpose === 'event' ? 'Event'
    : purpose === 'ship_to_client' ? 'Ship to Client'
    : purpose === 'other' ? (purposeNote || 'Other')
    : 'Not set'
  const isScheduled = status === 'scheduled'
  const statusLabel = isScheduled ? 'Scheduled' : 'Pending'
  const urgencyLabel = urgency === 'rush' ? 'Rush' : 'Standard'

  const detailRow = (label: string, value: string | null | undefined) =>
    value ? `<tr><td style="padding:6px 0;font-size:13px;color:#86868b;width:140px">${label}</td><td style="padding:6px 0;font-size:14px;color:#1d1d1f">${value}</td></tr>` : ''

  const headline = isScheduled ? 'Transport Scheduled' : 'New Transport Pending'
  const subject = isScheduled
    ? `Transport scheduled: ${vehicleDesc}`
    : `New transport pending: ${vehicleDesc}`
  const html = layout(`
<h1 style="margin:0 0 8px;font-size:22px;color:#1d1d1f">${headline}</h1>
<p style="margin:0 0 16px;font-size:15px;color:#86868b">Requested by ${requestedBy} · ${statusLabel}${urgency === 'rush' ? ' · <strong style="color:#ef4444">Rush</strong>' : ''}</p>
${vehicleBox(vehicleDesc)}
<table cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0">
  ${detailRow('Purpose', purposeLabel)}
  ${detailRow('Pickup', pickupLocation)}
  ${detailRow('Delivery', deliveryLocation)}
  ${detailRow('Trailer', trailerType === 'enclosed' ? 'Enclosed' : trailerType === 'open' ? 'Open' : null)}
  ${detailRow('Scheduled', scheduledDate ? new Date(scheduledDate).toLocaleDateString() : null)}
  ${detailRow('Carrier', carrierInfo)}
  ${detailRow('Estimated Price', estimatedPrice != null ? `$${Number(estimatedPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null)}
  ${detailRow('Urgency', urgencyLabel)}
  ${detailRow('Client', clientName || clientPhone ? [clientName, clientPhone].filter(Boolean).join(' · ') : null)}
  ${detailRow('Notes', notes)}
</table>
${ctaButton(`${BASE_URL}/transport`, 'View Transport')}
`)
  return { subject, html }
}

export function newVehicleEmail({
  vehicleDesc,
  assigneeName,
  stage,
  vehicleId,
}: {
  vehicleDesc: string
  assigneeName: string
  stage: string
  vehicleId: string
}) {
  const subject = `New vehicle added: ${vehicleDesc}`
  const html = layout(`
<h1 style="margin:0 0 8px;font-size:22px;color:#1d1d1f">New Vehicle in Your Queue</h1>
<p style="margin:0 0 16px;font-size:15px;color:#86868b">Hi ${assigneeName}, a new vehicle has been added to <strong>${stage}</strong>.</p>
${vehicleBox(vehicleDesc)}
${ctaButton(`${BASE_URL}/vehicles/${vehicleId}`, 'View Vehicle')}
`)
  return { subject, html }
}

export function partsRequestEmail({
  vehicleDesc,
  partName,
  url,
  requestedBy,
  vehicleId,
}: {
  vehicleDesc: string
  partName: string
  url: string | null
  requestedBy: string
  vehicleId: string
}) {
  const subject = `Parts request: ${vehicleDesc} — ${partName}`
  const html = layout(`
<h1 style="margin:0 0 8px;font-size:22px;color:#1d1d1f">New Parts Request</h1>
<p style="margin:0 0 16px;font-size:15px;color:#86868b">Requested by ${requestedBy}</p>
${vehicleBox(vehicleDesc)}
<div style="background:#f5f5f7;border-radius:8px;padding:16px;margin:16px 0">
<p style="margin:0 0 8px;font-size:15px;color:#1d1d1f;font-weight:600">${partName}</p>
${url ? `<p style="margin:0;font-size:13px;color:#86868b">Link: <a href="${url}" style="color:#1d1d1f">${url}</a></p>` : '<p style="margin:0;font-size:13px;color:#86868b;font-style:italic">No URL provided — needs sourcing</p>'}
</div>
${ctaButton(`${BASE_URL}/vehicles/${vehicleId}`, 'View Vehicle')}
`)
  return { subject, html }
}
