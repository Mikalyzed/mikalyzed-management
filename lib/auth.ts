import { prisma } from './db'
import type { Role } from './constants'

// Temporary: no auth, auto-create/return admin user
export async function getSessionUser(_request?: Request) {
  let user = await prisma.user.findFirst({ where: { role: 'admin' } })
  if (!user) {
    user = await prisma.user.create({
      data: {
        clerkId: 'temp_admin',
        name: 'Fernando',
        email: 'fernando@mikalyzed.com',
        role: 'admin',
      },
    })
  }
  return user
}

export function requireRole(userRole: string, allowed: Role[]): boolean {
  if (userRole === 'admin') return true
  return allowed.includes(userRole as Role)
}

export function createSessionToken(userId: string): string {
  return btoa(JSON.stringify({ userId, ts: Date.now() }))
}
