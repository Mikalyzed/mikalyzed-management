import { PrismaClient } from '@prisma/client'
import { writeFileSync } from 'fs'
import { execSync } from 'child_process'

const prisma = new PrismaClient()

const STAGE_ID = '09c64517-fe1b-4da3-9b16-044d577aa0cd' // 2006 Mercedes SL500 NVI

const stage = await prisma.vehicleStage.findUnique({
  where: { id: STAGE_ID },
  include: {
    vehicle: { select: { stockNumber: true, year: true, make: true, model: true, color: true, vin: true, mileage: true } },
    assignee: { select: { name: true } },
  },
})

const v = stage.vehicle
const vehicleDesc = `${v.year ?? ''} ${v.make} ${v.model}`.trim()
const checklist = (stage.checklist) || []
const inspectionItems = checklist.filter(c => !c.addedByMechanic)
const followUps = checklist.filter(c => c.addedByMechanic)

const STATUS_COLORS = {
  ok: '#16a34a', no: '#16a34a', topped: '#2563eb',
  issue: '#dc2626', yes: '#dc2626',
}
const STATUS_LABELS = {
  ok: 'OK', topped: 'Topped Off', issue: 'Issue',
  no: 'No', yes: 'Yes',
}

const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

function pill(status) {
  const color = STATUS_COLORS[status] || '#86868b'
  return `<span style="display:inline-block;padding:3px 12px;border-radius:100px;background:${color}20;color:${color};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em">${STATUS_LABELS[status] || status}</span>`
}

function renderStructured(item) {
  const d = item.data || {}
  if (item.type === 'tirePsi') {
    const cells = ['fl', 'fr', 'rl', 'rr'].map(k => `<td style="padding:8px;text-align:center;font-size:13px;color:#1d1d1f;background:#f5f5f7;border-radius:6px">${d[k] ?? '—'}</td>`).join('<td style="width:6px"></td>')
    const labels = ['FL', 'FR', 'RL', 'RR'].map(l => `<td style="padding:0 0 4px;text-align:center;font-size:11px;color:#86868b;font-weight:600">${l}</td>`).join('<td></td>')
    return `<table cellpadding="0" cellspacing="0" style="margin-top:8px"><tr>${labels}</tr><tr>${cells}</tr></table>`
  }
  if (item.type === 'brakePads') {
    return `<p style="margin:8px 0 0;font-size:13px;color:#1d1d1f">Front pads: <strong>${d.frontMm ?? '—'}mm</strong> · Rear pads: <strong>${d.rearMm ?? '—'}mm</strong></p>`
  }
  const renderSubrows = (keys) => keys
    .filter(([k]) => d[k])
    .map(([k, l]) => {
      const s = typeof d[k] === 'string' ? d[k] : d[k]?.status
      const n = typeof d[k] === 'object' && d[k]?.note ? d[k].note : ''
      if (!s) return ''
      return `<tr><td style="padding:4px 8px 4px 0;font-size:13px;color:#1d1d1f">${l}</td><td style="padding:4px 0;text-align:right">${pill(s)}</td></tr>${n ? `<tr><td colspan="2" style="padding:0 0 8px;font-size:12px;color:#86868b;font-style:italic">→ ${n}</td></tr>` : ''}`
    })
    .join('')
  if (item.type === 'fluids') {
    return `<table cellpadding="0" cellspacing="0" style="width:100%;margin-top:8px">${renderSubrows([
      ['powerSteering', 'Power steering'], ['brake', 'Brake'], ['engineOil', 'Engine oil'],
      ['transmission', 'Transmission'], ['antifreeze', 'Antifreeze'],
    ])}</table>`
  }
  if (item.type === 'engineCheck') {
    return `<table cellpadding="0" cellspacing="0" style="width:100%;margin-top:8px">${renderSubrows([
      ['sparkPlug', 'Spark plug'], ['coil', 'Coil'], ['distributorCap', 'Distributor cap'], ['sparkPlugWires', 'Spark plug wires'],
    ])}</table>`
  }
  if (item.type === 'electrical') {
    return `<table cellpadding="0" cellspacing="0" style="width:100%;margin-top:8px">${renderSubrows([
      ['regularBeam', 'Regular beam'], ['highBeam', 'High beam'], ['fogLights', 'Fog lights'],
      ['radio', 'Radio'], ['top', 'Top'], ['brakeLights', 'Brake lights'],
      ['reverseLights', 'Reverse lights'], ['turnSignals', 'Turn signals'],
    ])}</table>`
  }
  if (item.type === 'steeringCheck') {
    return `<table cellpadding="0" cellspacing="0" style="width:100%;margin-top:8px">${renderSubrows([
      ['play', 'Play'], ['noise', 'Noise'], ['fluid', 'Fluid'], ['column', 'Column'],
    ])}</table>`
  }
  if (item.type === 'suspensionCheck') {
    return `<table cellpadding="0" cellspacing="0" style="width:100%;margin-top:8px">${renderSubrows([
      ['shocks', 'Shocks'], ['struts', 'Struts'], ['bushings', 'Bushings'], ['controlArms', 'Control arms'],
    ])}</table>`
  }
  return ''
}

const itemsHtml = inspectionItems.map(item => `
  <div style="padding:14px 16px;border:1px solid #e5e5e7;border-radius:10px;margin-bottom:10px;background:#fff;page-break-inside:avoid">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <p style="margin:0;font-size:14px;font-weight:600;color:#1d1d1f">${item.item}</p>
      <span style="display:inline-block;padding:3px 10px;border-radius:100px;background:${item.done ? '#16a34a20' : '#dc262620'};color:${item.done ? '#16a34a' : '#dc2626'};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap">${item.done ? '✓ Done' : 'Not Done'}</span>
    </div>
    ${item.note ? `<p style="margin:8px 0 0;font-size:13px;color:#525252;font-style:italic">↳ ${item.note}</p>` : ''}
    ${renderStructured(item)}
  </div>
`).join('')

const followUpsHtml = followUps.length === 0 ? '' : `
  <h2 style="font-size:16px;font-weight:700;color:#1d1d1f;margin:24px 0 12px;letter-spacing:-0.01em">Mechanic-Added Follow-Up Tasks (${followUps.length})</h2>
  ${followUps.map(f => `
    <div style="padding:12px 14px;border:1px solid #e5e5e7;border-radius:8px;margin-bottom:8px;background:#fafafa;page-break-inside:avoid">
      <p style="margin:0;font-size:13px;color:#1d1d1f">${f.item}${f.estimatedHours ? ` <span style="color:#86868b">· ~${f.estimatedHours}h est.</span>` : ''}${f.approved ? ` <span style="color:#86868b">· ${f.approved}</span>` : ''}</p>
    </div>
  `).join('')}
`

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Vehicle Inspection Report — ${vehicleDesc}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1d1d1f;margin:0;padding:32px;background:#fff;line-height:1.5">
  <div style="max-width:720px;margin:0 auto">
    <div style="border-bottom:2px solid #1d1d1f;padding-bottom:20px;margin-bottom:24px">
      <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#86868b">Mikalyzed Auto Boutique</p>
      <h1 style="margin:6px 0 4px;font-size:26px;font-weight:700;letter-spacing:-0.02em">Vehicle Inspection Report</h1>
      <p style="margin:0;font-size:14px;color:#525252">${stage.scopeName || 'New Vehicle Inspection'}</p>
    </div>

    <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;border-collapse:collapse">
      <tr>
        <td style="padding:8px 0;font-size:12px;color:#86868b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;width:140px">Vehicle</td>
        <td style="padding:8px 0;font-size:14px;color:#1d1d1f;font-weight:600">${vehicleDesc}</td>
      </tr>
      <tr><td style="padding:8px 0;font-size:12px;color:#86868b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">Stock #</td><td style="padding:8px 0;font-size:14px">${v.stockNumber}</td></tr>
      ${v.vin ? `<tr><td style="padding:8px 0;font-size:12px;color:#86868b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">VIN</td><td style="padding:8px 0;font-size:14px;font-family:'SF Mono',Menlo,monospace">${v.vin}</td></tr>` : ''}
      ${v.color ? `<tr><td style="padding:8px 0;font-size:12px;color:#86868b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">Color</td><td style="padding:8px 0;font-size:14px">${v.color}</td></tr>` : ''}
      ${v.mileage ? `<tr><td style="padding:8px 0;font-size:12px;color:#86868b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">Mileage</td><td style="padding:8px 0;font-size:14px">${v.mileage.toLocaleString()}</td></tr>` : ''}
      <tr><td style="padding:8px 0;font-size:12px;color:#86868b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">Technician</td><td style="padding:8px 0;font-size:14px">${stage.assignee?.name || '—'}</td></tr>
      <tr><td style="padding:8px 0;font-size:12px;color:#86868b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">Started</td><td style="padding:8px 0;font-size:14px">${fmtDate(stage.createdAt)}</td></tr>
      <tr><td style="padding:8px 0;font-size:12px;color:#86868b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em">Completed</td><td style="padding:8px 0;font-size:14px">${stage.completedAt ? fmtDate(stage.completedAt) : '—'}</td></tr>
    </table>

    <h2 style="font-size:16px;font-weight:700;color:#1d1d1f;margin:0 0 12px;letter-spacing:-0.01em">Inspection Checklist (${inspectionItems.length} items)</h2>
    ${itemsHtml}
    ${followUpsHtml}

    <p style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e7;font-size:11px;color:#86868b;text-align:center">
      Generated ${fmtDate(new Date())} · Mikalyzed Auto Boutique
    </p>
  </div>
</body></html>`

const htmlPath = `/tmp/inspection-${v.stockNumber}.html`
const pdfPath = `/tmp/inspection-${v.stockNumber}-${stage.completedAt.toISOString().slice(0,10)}.pdf`
writeFileSync(htmlPath, html)

execSync(`'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --headless --disable-gpu --print-to-pdf='${pdfPath}' --no-pdf-header-footer 'file://${htmlPath}'`, { stdio: 'inherit' })

console.log(`\nPDF: ${pdfPath}`)

await prisma.$disconnect()
