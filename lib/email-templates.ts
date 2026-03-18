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

export function overdueAlertEmail({
  vehicleDesc,
  stage,
  hoursOverdue,
  slaHours,
  vehicleId,
}: {
  vehicleDesc: string
  stage: string
  hoursOverdue: number
  slaHours: number
  vehicleId: string
}) {
  const subject = `⚠️ Overdue: ${vehicleDesc} in ${stage}`
  const html = layout(`
<h1 style="margin:0 0 8px;font-size:22px;color:#1d1d1f">Vehicle Overdue</h1>
<p style="margin:0 0 16px;font-size:15px;color:#86868b">This vehicle has exceeded its SLA in the <strong>${stage}</strong> stage.</p>
${vehicleBox(vehicleDesc)}
<p style="font-size:15px;color:#1d1d1f">SLA: <strong>${slaHours}h</strong> · Overdue by <strong>${Math.round(hoursOverdue)}h</strong></p>
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
