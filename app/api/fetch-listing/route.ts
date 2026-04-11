import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import * as cheerio from 'cheerio'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 })

  try {
    // Fetch the listing page
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    })
    if (!res.ok) return NextResponse.json({ error: `Failed to fetch listing: ${res.status}` }, { status: 500 })

    const html = await res.text()
    const $ = cheerio.load(html)

    // Extract text content — remove scripts/styles
    $('script, style, noscript').remove()
    const pageText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 8000)

    // Send to Claude for parsing
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 500,
      system: 'You are a car listing parser for advertisement images. Extract key vehicle details and return ONLY a JSON object with these exact fields: year, vehicleName, spec1Label, spec1Value, spec2Label, spec2Value, spec3Label, spec3Value, spec4Label, spec4Value. IMPORTANT RULES: vehicleName must be the MODEL ONLY (e.g. "CAMARO" not "CHEVROLET CAMARO", "MUSTANG" not "FORD MUSTANG", "CORVETTE" not "CHEVROLET CORVETTE"). Keep ALL spec values SHORT - maximum 12 characters (e.g. "LS1 V8" not "Gen III LS1 V8 engine", "104,364" not "104,364 miles", "6-Speed MT" not "6-speed manual transmission", "RWD" not "Rear wheel drive"). Labels should be one word like ENGINE, MILES, BUILD, TRANS, POWER, TORQUE, PLATFORM. Choose the 4 most compelling specs. Always include mileage. Return only valid JSON.',
      messages: [{ role: 'user', content: pageText }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const data = JSON.parse(text)

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Fetch listing error:', error.message)
    return NextResponse.json({ error: error.message || 'Failed to parse listing' }, { status: 500 })
  }
}
