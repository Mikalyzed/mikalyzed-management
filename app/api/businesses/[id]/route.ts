import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'

function dealAccess(role: string) {
  return requireRole(role, ['sales_manager'])
}

const STR_FIELDS = [
  'businessName', 'tradeName', 'enterpriseType', 'taxId',
  'street', 'city', 'state', 'zip', 'county', 'mortgageType',
  'phone', 'email', 'typeOfBusiness', 'loanLease', 'operatingLease',
  'priorBankruptcy', 'priorRepossession', 'lawsuitParty', 'delinquentTaxes',
  'operatorFirstName', 'operatorLastName', 'operatorStreet', 'operatorCity',
  'operatorState', 'operatorZip', 'operatorCounty',
  'principalFirstName', 'principalLastName', 'principalJobTitle', 'principalPhone',
  'principalStreet', 'principalCity', 'principalState', 'principalZip', 'principalCounty',
] as const
const INT_FIELDS = ['yearsInBusiness', 'monthsInBusiness', 'lengthAtAddressYears', 'lengthAtAddressMonths', 'vehiclesFinanced', 'vehiclesOwned'] as const
const FLOAT_FIELDS = ['grossMonthlyIncome', 'aggregateMonthlyPmt', 'principalOwnershipPct'] as const

/** PATCH /api/businesses/:id — partial update, commit-on-blur friendly. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!dealAccess(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}

  for (const k of STR_FIELDS) {
    if (!(k in body)) continue
    const v = body[k]
    data[k] = typeof v === 'string' && v.trim() ? v.trim() : null
  }
  // The name can never be blanked — ignore attempts.
  if (data.businessName === null) delete data.businessName

  for (const k of INT_FIELDS) {
    if (!(k in body)) continue
    const n = Number(body[k])
    data[k] = body[k] === null || body[k] === '' || Number.isNaN(n) ? null : Math.trunc(n)
  }
  for (const k of FLOAT_FIELDS) {
    if (!(k in body)) continue
    const n = Number(body[k])
    data[k] = body[k] === null || body[k] === '' || Number.isNaN(n) ? null : n
  }
  if ('principalDob' in body) {
    if (body.principalDob) {
      const d = new Date(body.principalDob as string)
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: 'Invalid principalDob date' }, { status: 400 })
      }
      data.principalDob = d
    } else {
      data.principalDob = null
    }
  }

  try {
    const business = await prisma.business.update({ where: { id }, data })
    return NextResponse.json({ business })
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === 'P2025') {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }
    throw e
  }
}
