import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib'
import type { VehicleStatusReport } from './vehicle-status'
import type { Bottleneck } from './bottlenecks'

/**
 * PDF rendering for management reports. The layout is code — the caller
 * supplies data only — so every generated report looks identical and
 * professional regardless of how it was requested (Reports page button or
 * the AskAI tool). Letter landscape, auto page-breaks, page numbers.
 */

const PAGE_W = 792 // Letter landscape
const PAGE_H = 612
const MARGIN = 40

const INK = rgb(0.09, 0.09, 0.11)
const SUB = rgb(0.42, 0.42, 0.45)
const RULE = rgb(0.88, 0.88, 0.87)
const WARN = rgb(0.71, 0.33, 0.04)
const CRIT = rgb(0.73, 0.11, 0.11)
const ACCENT_INK = rgb(0.30, 0.35, 0.06)

type Col = { header: string; width: number; align?: 'left' | 'right' }
type Cell = { text: string; color?: ReturnType<typeof rgb>; bold?: boolean }

class ReportPdf {
  private doc!: PDFDocument
  private page!: PDFPage
  private font!: PDFFont
  private bold!: PDFFont
  private y = 0

  static async create() {
    const r = new ReportPdf()
    r.doc = await PDFDocument.create()
    r.font = await r.doc.embedFont(StandardFonts.Helvetica)
    r.bold = await r.doc.embedFont(StandardFonts.HelveticaBold)
    r.newPage()
    return r
  }

  private newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H])
    this.y = PAGE_H - MARGIN
  }

  private ensure(height: number) {
    if (this.y - height < MARGIN + 18) this.newPage()
  }

  // Standard fonts only encode WinAnsi — user-entered text (checklist items,
  // notes) can carry smart quotes, emoji, or newlines that would throw.
  private sanitize(text: string): string {
    return text
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/…/g, '...')
      .replace(/\s+/g, ' ')
      .replace(/[^\x20-\x7E\xA1-\xFF]/g, '')
      .trim()
  }

  private wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const words = this.sanitize(text).split(' ')
    const lines: string[] = []
    let line = ''
    for (const w of words) {
      const probe = line ? `${line} ${w}` : w
      if (font.widthOfTextAtSize(probe, size) <= width) { line = probe; continue }
      if (line) lines.push(line)
      // Hard-break a single word longer than the column
      let chunk = w
      while (font.widthOfTextAtSize(chunk, size) > width && chunk.length > 1) {
        let cut = chunk.length - 1
        while (cut > 1 && font.widthOfTextAtSize(chunk.slice(0, cut), size) > width) cut--
        lines.push(chunk.slice(0, cut))
        chunk = chunk.slice(cut)
      }
      line = chunk
    }
    if (line) lines.push(line)
    return lines.length ? lines : ['']
  }

  header(title: string, subtitle: string) {
    this.page.drawText('MIKALYZED AUTO BOUTIQUE — MANAGEMENT', {
      x: MARGIN, y: this.y - 8, size: 8, font: this.bold, color: ACCENT_INK,
    })
    this.y -= 24
    this.page.drawText(title, { x: MARGIN, y: this.y - 8, size: 20, font: this.bold, color: INK })
    this.y -= 26
    this.page.drawText(subtitle, { x: MARGIN, y: this.y - 4, size: 9, font: this.font, color: SUB })
    this.y -= 20
  }

  stats(items: Array<{ label: string; value: string; tone?: 'warn' | 'crit' }>) {
    const w = (PAGE_W - MARGIN * 2) / items.length
    this.ensure(46)
    items.forEach((it, i) => {
      const x = MARGIN + i * w
      const color = it.tone === 'crit' ? CRIT : it.tone === 'warn' ? WARN : INK
      this.page.drawText(it.value, { x, y: this.y - 16, size: 16, font: this.bold, color })
      this.page.drawText(it.label.toUpperCase(), { x, y: this.y - 28, size: 6.5, font: this.bold, color: SUB })
    })
    this.y -= 44
  }

  section(title: string, note?: string) {
    this.ensure(note ? 46 : 34)
    this.y -= 10
    this.page.drawText(title, { x: MARGIN, y: this.y - 10, size: 13, font: this.bold, color: INK })
    this.y -= 24
    if (note) {
      this.page.drawText(note, { x: MARGIN, y: this.y - 2, size: 8.5, font: this.font, color: SUB })
      this.y -= 14
    }
  }

  table(cols: Col[], rows: Array<{ cells: Cell[]; detail?: Cell[] }>) {
    const size = 8
    const lineH = 10.5
    const padX = 4
    const detailSize = 7.5
    const detailLineH = 9.5
    const detailIndent = 78 // under the Vehicle column, past Stock #
    const detailWidth = PAGE_W - MARGIN * 2 - detailIndent - padX
    const drawHead = () => {
      let x = MARGIN
      for (const c of cols) {
        const tx = c.align === 'right'
          ? x + c.width - padX - this.bold.widthOfTextAtSize(c.header.toUpperCase(), 7)
          : x + padX
        this.page.drawText(c.header.toUpperCase(), { x: tx, y: this.y - 8, size: 7, font: this.bold, color: SUB })
        x += c.width
      }
      this.y -= 12
      this.page.drawLine({
        start: { x: MARGIN, y: this.y }, end: { x: PAGE_W - MARGIN, y: this.y },
        thickness: 0.75, color: RULE,
      })
      this.y -= 2
    }
    drawHead()
    for (const row of rows) {
      const wrapped = row.cells.map((cell, i) =>
        this.wrap(cell.text, cell.bold ? this.bold : this.font, size, cols[i].width - padX * 2))
      const h = Math.max(...wrapped.map(w => w.length)) * lineH + 5
      if (this.y - h < MARGIN + 18) { this.newPage(); drawHead() }
      let x = MARGIN
      row.cells.forEach((cell, i) => {
        const font = cell.bold ? this.bold : this.font
        wrapped[i].forEach((ln, li) => {
          const tx = cols[i].align === 'right'
            ? x + cols[i].width - padX - font.widthOfTextAtSize(ln, size)
            : x + padX
          this.page.drawText(ln, { x: tx, y: this.y - 8 - li * lineH, size, font, color: cell.color ?? INK })
        })
        x += cols[i].width
      })
      this.y -= h
      // Deep-dive detail lines: indented under the row, page-break safe.
      for (const d of row.detail ?? []) {
        const font = d.bold ? this.bold : this.font
        const lines = this.wrap(d.text, font, detailSize, detailWidth)
        const dh = lines.length * detailLineH + 2
        if (this.y - dh < MARGIN + 18) this.newPage()
        lines.forEach((ln, li) => {
          this.page.drawText(ln, {
            x: MARGIN + detailIndent + (li === 0 ? 0 : 8),
            y: this.y - 7 - li * detailLineH,
            size: detailSize, font, color: d.color ?? SUB,
          })
        })
        this.y -= dh
      }
      if (row.detail?.length) this.y -= 3
      this.page.drawLine({
        start: { x: MARGIN, y: this.y }, end: { x: PAGE_W - MARGIN, y: this.y },
        thickness: 0.5, color: RULE,
      })
      this.y -= 2
    }
  }

  list(items: string[], color = INK) {
    for (const it of items) {
      const lines = this.wrap(it, this.font, 8.5, PAGE_W - MARGIN * 2 - 12)
      const h = lines.length * 11 + 3
      this.ensure(h)
      lines.forEach((ln, li) => {
        this.page.drawText(li === 0 ? `•  ${ln}` : ln, {
          x: MARGIN + (li === 0 ? 0 : 12), y: this.y - 9 - li * 11, size: 8.5, font: this.font, color,
        })
      })
      this.y -= h
    }
  }

  async finish(): Promise<Uint8Array> {
    const pages = this.doc.getPages()
    pages.forEach((p, i) => {
      p.drawText(`Mikalyzed Auto Boutique — internal`, {
        x: MARGIN, y: MARGIN - 22, size: 7, font: this.font, color: SUB,
      })
      const label = `Page ${i + 1} of ${pages.length}`
      p.drawText(label, {
        x: PAGE_W - MARGIN - this.font.widthOfTextAtSize(label, 7),
        y: MARGIN - 22, size: 7, font: this.font, color: SUB,
      })
    })
    return this.doc.save()
  }
}

const fmtDate = (iso: string | null) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

export async function renderVehicleStatusPdf(r: VehicleStatusReport, bottlenecks: Bottleneck[] = []): Promise<Uint8Array> {
  const pdf = await ReportPdf.create()
  const gen = new Date(r.generatedAt)
  pdf.header(
    'Inventory Status Report',
    `Generated ${gen.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · ${r.counts.activeVehicles} active vehicles · live DMS data`,
  )
  pdf.stats([
    { label: 'In stock', value: String(r.counts.inStock) },
    { label: 'In recon', value: String(r.counts.inRecon) },
    { label: 'At external repair', value: String(r.counts.atExternalRepair) },
    { label: 'External overdue', value: String(r.counts.externalOverdue), tone: r.counts.externalOverdue ? 'crit' : undefined },
    { label: 'Parts coming in', value: String(r.counts.partsInbound) },
    { label: 'Parts here', value: String(r.counts.partsHere) },
  ])

  if (bottlenecks.length) {
    pdf.section(`Bottlenecks — ${bottlenecks.length}`, 'Rule-detected: these re-appear every morning until cleared.')
    pdf.list(
      bottlenecks.map(b => `${b.stock ? `${b.stock} ` : ''}${b.vehicle ?? ''} — ${b.issue}. ${b.detail}`),
      WARN,
    )
  }

  const taskDetail = (tasks: Array<{ item: string; done: boolean; note: string | null; assignee: string | null }>) =>
    tasks.map(t => ({
      text: `[${t.done ? 'x' : ' '}] ${t.item}${t.assignee ? ` — ${t.assignee}` : ''}${t.note ? ` (${t.note})` : ''}`,
      color: t.done ? SUB : INK,
    }))
  const partDetail = (parts: Array<{ name: string; status: string; eta: string | null }>) =>
    parts.map(p => ({
      text: `Part coming in: ${p.name} — ${p.status}${p.eta ? `, ETA ${fmtDate(p.eta)}` : ''}`,
      color: WARN,
    }))

  pdf.section(
    `In Recon — ${r.counts.inRecon} vehicles`,
    'Sorted oldest first, over 120 days flagged. Each car lists its current-stage tasks ([x] = done) and any parts on the way.',
  )
  pdf.table(
    [
      { header: 'Stock #', width: 70 }, { header: 'Vehicle', width: 230 },
      { header: 'Stage', width: 90 }, { header: 'Assignee', width: 105 },
      { header: 'Flags', width: 130 },
      { header: 'Days in stock', width: 57, align: 'right' }, { header: 'Parts', width: 30, align: 'right' },
    ],
    r.recon.map(v => {
      const flags = [
        v.awaitingParts ? `awaiting parts${v.awaitingPartsName ? `: ${v.awaitingPartsName}` : ''}` : null,
        v.paused ? 'paused' : null,
        v.scheduledDate ? `sched ${fmtDate(v.scheduledDate)}` : null,
      ].filter(Boolean).join(' · ')
      const old = (v.daysInStock ?? 0) > 120
      return {
        cells: [
          { text: v.stock, bold: true }, { text: v.vehicle },
          { text: v.stage ? `${v.stage} (${v.stageStatus === 'in_progress' ? 'in progress' : 'pending'})` : 'no open stage' },
          { text: v.assignee ?? 'unassigned' },
          { text: flags, color: v.awaitingParts ? WARN : SUB },
          { text: String(v.daysInStock ?? '—'), color: old ? WARN : INK, bold: old },
          { text: v.openParts ? String(v.openParts) : '' },
        ],
        detail: [
          ...taskDetail(v.tasks),
          ...(v.stageNotes ? [{ text: `Notes: ${v.stageNotes}`, color: SUB }] : []),
          ...partDetail(v.partsInbound),
        ],
      }
    }),
  )

  pdf.section(
    `External Repairs — ${r.counts.openExternalRepairs} open`,
    `${r.counts.externalOverdue} past expected return · ${r.externalRepairs.filter(e => e.status === 'pending').length} not sent to the shop yet. Work, notes, and inbound parts under each car.`,
  )
  pdf.table(
    [
      { header: 'Stock #', width: 70 }, { header: 'Vehicle', width: 170 },
      { header: 'Shop', width: 110 }, { header: 'Work', width: 172 },
      { header: 'Status', width: 60 }, { header: 'Sent', width: 50 }, { header: 'Expected back', width: 80 },
    ],
    r.externalRepairs.map(e => {
      const backTone = e.overdueDays >= 30 ? CRIT : e.overdueDays > 0 ? WARN : INK
      return {
        cells: [
          { text: e.stock, bold: true }, { text: e.vehicle },
          { text: e.shop + (e.atDealership ? ' (at dealership)' : '') },
          { text: e.work },
          { text: e.status === 'pending' ? 'not sent' : e.status.replace('_', ' ') },
          { text: fmtDate(e.sent) },
          { text: e.overdueDays > 0 ? `${fmtDate(e.expectedBack)} · ${e.overdueDays}d overdue` : fmtDate(e.expectedBack), color: backTone, bold: e.overdueDays > 0 },
        ],
        detail: [
          ...(e.notes ? [{ text: `Notes: ${e.notes}`, color: SUB }] : []),
          ...partDetail(e.partsInbound),
        ],
      }
    }),
  )

  pdf.section(
    `Parts Pipeline — ${r.parts.length} open (${r.counts.partsRequested} in requested)`,
    'Grouped by status, oldest first — anything sitting in "requested" for over 7 days is flagged.',
  )
  pdf.table(
    [
      { header: 'Stock #', width: 70 }, { header: 'Vehicle', width: 190 },
      { header: 'Part', width: 292 }, { header: 'Status', width: 70 },
      { header: 'Age / ETA', width: 90 },
    ],
    r.parts.map(p => {
      const stuck = p.status === 'requested' && p.ageDays > 7
      const ageOrEta = p.status === 'ordered' && p.eta
        ? `ETA ${fmtDate(p.eta)}`
        : p.status === 'received'
          ? (p.installTaskCreated ? 'install task created' : 'awaiting install task')
          : `${p.ageDays}d in ${p.status}`
      return {
        cells: [
          { text: p.stock, bold: true }, { text: p.vehicle },
          { text: p.part.slice(0, 90) },
          { text: p.status, color: stuck ? WARN : INK, bold: stuck },
          { text: ageOrEta, color: stuck ? WARN : SUB, bold: stuck },
        ],
      }
    }),
  )

  pdf.section(
    `In Stock — ${r.counts.inStock} vehicles`,
    'Posted / just-in cars not in recon or external. Review for price drops, fixes, or additions. Sorted oldest first.',
  )
  pdf.table(
    [
      { header: 'Stock #', width: 70 }, { header: 'Vehicle', width: 280 },
      { header: 'Color', width: 100 }, { header: 'Location', width: 110 },
      { header: 'Asking', width: 80, align: 'right' },
      { header: 'Days in stock', width: 72, align: 'right' },
    ],
    r.inStock.map(v => ({
      cells: [
        { text: v.stock, bold: true }, { text: v.vehicle },
        { text: v.color ?? '' }, { text: v.location ?? '' },
        { text: v.askingPrice != null ? `$${Math.round(v.askingPrice).toLocaleString('en-US')}` : '—' },
        { text: String(v.daysInStock ?? '—') },
      ],
    })),
  )

  if (r.flags.length) {
    pdf.section(`Needs Attention — ${r.flags.length} records`, 'Vehicles with no inventory status set; they are excluded from the counts above.')
    pdf.list(r.flags, WARN)
  }

  return pdf.finish()
}
