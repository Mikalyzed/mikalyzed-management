import { cookies } from 'next/headers'
import { prisma } from './db'
import type { Role } from './constants'

export async function getSessionUser(request?: Request) {
  // Use next/headers cookies (works reliably in API routes)
  const cookieStore = await cookies()
  const session = cookieStore.get('mm_session')

  if (!session?.value) return null

  try {
    const decoded = JSON.parse(atob(session.value))
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    })
    return user
  } catch {
    return null
  }
}

export function requireRole(userRole: string, allowed: Role[]): boolean {
  if (userRole === 'admin') return true
  return allowed.includes(userRole as Role)
}

export function createSessionToken(userId: string): string {
  return btoa(JSON.stringify({ userId, ts: Date.now() }))
}
