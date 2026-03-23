import { NextResponse } from 'next/server'

// SLA-based overdue checks have been removed.
// This endpoint is kept as a no-op for backward compatibility.
export async function POST() {
  return NextResponse.json({ sent: 0 })
}
