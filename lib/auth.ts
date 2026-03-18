import { prisma } from './db'
import type { Role } from './constants'

// Temporary auth until Clerk is set up
// For now, we use a simple cookie-based auth with role
// This will be replaced with Clerk middleware later

export async function getSessionUser(request: Request) {
  const cookie = request.headers.get('cookie') || ''
  const match = cookie.match(/mm_session=([^;]+)/)
  if (!match) return null

  try {
    const decoded = JSON.parse(atob(match[1]))
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

// Simple auth for MVP — will be replaced by Clerk
export function createSessionToken(userId: string): string {
  return btoa(JSON.stringify({ userId, ts: Date.now() }))
}
