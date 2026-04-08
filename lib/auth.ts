import { cookies } from 'next/headers'
import { prisma } from './db'
import type { Role } from './constants'

export async function getSessionUser() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('mm_user_id')?.value

  if (!userId) {
    // Fallback: auto-create admin if no users exist (first run)
    const count = await prisma.user.count()
    if (count === 0) {
      return await prisma.user.create({
        data: {
          clerkId: 'temp_admin',
          name: 'Fernando',
          email: 'fernando@mikalyzed.com',
          role: 'admin',
        },
      })
    }
    return null
  }

  return await prisma.user.findUnique({ where: { id: userId } })
}

export function requireRole(userRole: string, allowed: Role[]): boolean {
  if (userRole === 'admin') return true
  return allowed.includes(userRole as Role)
}

export function canSeeAllLeads(role: string): boolean {
  return role === 'admin' || role === 'sales_manager'
}
