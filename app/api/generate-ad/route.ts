import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import path from 'path'
import fs from 'fs'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const W = 1080
const H = 1350

async function detectVehicleCenter(imageBuffer: Buffer, imgWidth: number, imgHeight: number): Promise<number> {
  try {
    const { pipeline } = await import('@xenova/transformers')

    // Convert buffer to base64 data URL for the model
    const base64 = imageBuffer.toString('base64')
    const dataUrl = `data:image/jpeg;base64,${base64}`

    const detector = await pipeline('object-detection', 'Xenova/detr-resnet-50')
    const results = await detector(dataUrl, { threshold: 0.3 })

    // Find car/vehicle detections
    const vehicleLabels = ['car', 'truck', 'bus', 'motorcycle', 'vehicle']
    const vehicles = (results as any[]).filter((r: any) =>
      vehicleLabels.some(label => r.label.toLowerCase().includes(label))
    )

    if (vehicles.length > 0) {
      // Use the largest/most confident detection
      const best = vehicles.sort((a: any, b: any) => b.score - a.score)[0]
      const box = best.box
      // box is { xmin, ymin, xmax, ymax } as fractions or pixels depending on model
      const centerY = (box.ymin + box.ymax) / 2
      console.log(`[ad-gen] Vehicle detected at center Y: ${centerY}, confidence: ${best.score}`)
      return centerY
    }
  } catch (e) {
    console.error('[ad-gen] Detection failed, using fallback:', e)
  }

  // Fallback: assume car is in the middle
  return imgHeight * 0.45
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const photoFile = formData.get('photo') as File
    const year = formData.get('year') as string
    const vehicleName = formData.get('vehicleName') as string
    const spec1Label = formData.get('spec1Label') as string
    const spec1Value = formData.get('spec1Value') as string
    const spec2Label = formData.get('spec2Label') as string
    const spec2Value = formData.get('spec2Value') as string
    const spec3Label = formData.get('spec3Label') as string
    const spec3Value = formData.get('spec3Value') as string
    const spec4Label = formData.get('spec4Label') as string
    const spec4Value = formData.get('spec4Value') as string

    if (!photoFile) return NextResponse.json({ error: 'Photo required' }, { status: 400 })

    const photoBytes = Buffer.from(await photoFile.arrayBuffer())
    const photoMeta = await sharp(photoBytes).metadata()
    const scale = W / (photoMeta.width || W)
    const scaledHeight = Math.round((photoMeta.height || H) * scale)

    // Resize to target width
    let scaledBuffer = await sharp(photoBytes).resize(W, scaledHeight).jpeg().toBuffer()

    // Detect vehicle center in the scaled image
    const vehicleCenterY = await detectVehicleCenter(scaledBuffer, W, scaledHeight)

    // Center the crop on the vehicle — pure center, no offset
    const idealCropTop = Math.round(vehicleCenterY - (H / 2))
    const cropTop = Math.max(0, Math.min(idealCropTop, scaledHeight - H))
    const cropHeight = Math.min(scaledHeight, H)

    console.log(`[ad-gen] Scaled: ${W}x${scaledHeight}, Vehicle center: ${vehicleCenterY}, Crop top: ${cropTop}`)

    let photoBuffer: Buffer
    if (scaledHeight >= H) {
      photoBuffer = await sharp(scaledBuffer)
        .extract({ left: 0, top: cropTop, width: W, height: H })
        .png()
        .toBuffer()
    } else {
      // Photo shorter than 1350 — extend with black at bottom
      photoBuffer = await sharp(scaledBuffer)
        .extend({ bottom: H - scaledHeight, background: { r: 0, g: 0, b: 0, alpha: 1 } })
        .png()
        .toBuffer()
    }

    // Create gradient overlay — transparent until 60%, then fades to near-black
    const gradientSvg = `<svg width="${W}" height="${H}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="black" stop-opacity="0"/>
          <stop offset="60%" stop-color="black" stop-opacity="0"/>
          <stop offset="80%" stop-color="black" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="black" stop-opacity="0.95"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#g)"/>
    </svg>`

    // Top bar overlay
    const topBarSvg = `<svg width="${W}" height="180">
      <rect width="${W}" height="180" fill="rgba(0,0,0,0.63)"/>
    </svg>`

    // Build text overlay SVG — truncate long values
    const truncate = (s: string, max: number) => s.length > max ? s.slice(0, max) : s
    const nameUpper = truncate((vehicleName || '').toUpperCase(), 16)
    const specs = [
      { label: truncate((spec1Label || '').toUpperCase(), 12), value: truncate(spec1Value || '', 14) },
      { label: truncate((spec2Label || '').toUpperCase(), 12), value: truncate(spec2Value || '', 14) },
      { label: truncate((spec3Label || '').toUpperCase(), 12), value: truncate(spec3Value || '', 14) },
      { label: truncate((spec4Label || '').toUpperCase(), 12), value: truncate(spec4Value || '', 14) },
    ]

    const nameY = 1108
    const divider1Y = nameY + 28
    const specLabelY = divider1Y + 34
    const specValueY = specLabelY + 26
    const divider2Y = specValueY + 38
    const footerY = divider2Y + 30

    const colWidth = (W - 88) / 4

    // Load Poppins fonts as base64 for SVG
    const fontBoldPath = path.join(process.cwd(), 'public', 'fonts', 'Poppins-Bold.ttf')
    const fontLightPath = path.join(process.cwd(), 'public', 'fonts', 'Poppins-Light.ttf')
    const fontBold = fs.readFileSync(fontBoldPath).toString('base64')
    const fontLight = fs.readFileSync(fontLightPath).toString('base64')

    const textSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <style>
        @font-face { font-family: 'PoppinsBold'; src: url(data:font/truetype;base64,${fontBold}); }
        @font-face { font-family: 'PoppinsLight'; src: url(data:font/truetype;base64,${fontLight}); }
      </style>

      <!-- AVAILABLE NOW badge — centered in 180px top bar -->
      <rect x="${W - 44 - 180}" y="${90 - 18}" width="180" height="36" rx="6" fill="none" stroke="rgb(50,200,100)" stroke-width="2"/>
      <text x="${W - 44 - 90}" y="${90 + 6}" text-anchor="middle" font-family="PoppinsBold" font-size="17" fill="rgb(50,200,100)">AVAILABLE NOW</text>

      <!-- Year -->
      <text x="44" y="${nameY - 100}" font-family="PoppinsLight" font-size="42" fill="white">${year || ''}</text>

      <!-- Vehicle Name -->
      <text x="39" y="${nameY}" font-family="PoppinsBold" font-size="110" fill="white">${nameUpper}</text>

      <!-- Divider 1 -->
      <line x1="44" y1="${divider1Y}" x2="1036" y2="${divider1Y}" stroke="rgba(180,180,180,1)" stroke-width="1"/>

      <!-- Specs -->
      ${specs.map((s, i) => `
        <text x="${44 + i * colWidth}" y="${specLabelY}" font-family="PoppinsLight" font-size="18" fill="rgb(180,180,180)">${s.label}</text>
        <text x="${44 + i * colWidth}" y="${specValueY}" font-family="PoppinsBold" font-size="26" fill="white">${s.value}</text>
      `).join('')}

      <!-- Divider 2 -->
      <line x1="44" y1="${divider2Y}" x2="1036" y2="${divider2Y}" stroke="rgba(180,180,180,1)" stroke-width="1"/>

      <!-- Footer -->
      <text x="44" y="${footerY}" font-family="PoppinsLight" font-size="26" fill="white">mikalyzedautoboutique.com</text>
      <text x="${W - 44}" y="${footerY}" text-anchor="end" font-family="PoppinsLight" font-size="26" fill="white">(305) 720-2533</text>
    </svg>`

    // Composite everything
    const composites: sharp.OverlayOptions[] = [
      { input: Buffer.from(gradientSvg), top: 0, left: 0 },
      { input: await sharp(Buffer.from(topBarSvg)).png().toBuffer(), top: 0, left: 0 },
      { input: Buffer.from(textSvg), top: 0, left: 0 },
    ]

    // Load logo — already white on transparent, just resize
    try {
      const logoPath = path.join(process.cwd(), 'public', 'logo.png')
      if (fs.existsSync(logoPath)) {
        const logoBuffer = await sharp(logoPath)
          .resize(320, null, { withoutEnlargement: true })
          .png()
          .toBuffer()
        const logoProcessedMeta = await sharp(logoBuffer).metadata()
        const logoH = logoProcessedMeta.height || 100
        const logoTop = Math.round((180 - logoH) / 2) // center in top bar
        composites.push({ input: logoBuffer, top: logoTop, left: 44 })
      }
    } catch (e) {
      console.error('Logo error:', e)
    }

    const outputBuffer = await sharp(photoBuffer)
      .composite(composites)
      .png()
      .toBuffer()

    return new NextResponse(outputBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="ad-${vehicleName || 'vehicle'}.png"`,
      },
    })
  } catch (error: any) {
    console.error('Generate ad error:', error)
    return NextResponse.json({ error: error.message || 'Failed to generate ad' }, { status: 500 })
  }
}
