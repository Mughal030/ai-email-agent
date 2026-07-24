/**
 * ============================================================================
 * AUTHENTICATION — NextAuth + sandbox mode bypass
 * ============================================================================
 *
 * Two modes:
 *   - SANDBOX (HF_PRODUCTION_MODE not set): no auth required. The app uses
 *     a "demo-user" automatically. This is how the Z.ai sandbox runs.
 *   - PRODUCTION (HF_PRODUCTION_MODE=true): NextAuth login required. All
 *     API routes check the session via getServerSession (not internal fetch).
 *     The admin account is auto-created on first run from env vars.
 * ============================================================================
 */

import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

export const DEMO_USER_ID = 'demo-user'
export const DEMO_USER_EMAIL = 'operator@agent.local'

/** True when running in production mode (HuggingFace) — auth required. */
export function isProductionMode(): boolean {
  return process.env.HF_PRODUCTION_MODE === 'true'
}

/**
 * Get the current user ID.
 * - Sandbox: returns DEMO_USER_ID (auto-created if missing)
 * - Production: uses NextAuth getServerSession to read the JWT cookie
 *   directly (no internal HTTP fetch — that breaks in Docker/HF).
 *
 * Must be called from a server context (API route or server component).
 */
export async function getCurrentUserId(): Promise<string | null> {
  if (!isProductionMode()) {
    await ensureDemoUser()
    return DEMO_USER_ID
  }

  // Production: use getServerSession to read the session directly
  try {
    const { getServerSession } = await import('next-auth')
    const { authOptions } = await import('@/app/api/auth/[...nextauth]/route')
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) return null

    const user = await db.user.findUnique({
      where: { email: session.user.email },
    })
    return user?.id || null
  } catch (e) {
    console.error('[auth] getCurrentUserId failed:', e)
    return null
  }
}

/** Ensure the demo user exists (sandbox mode only). */
export async function ensureDemoUser(): Promise<string> {
  let user = await db.user.findUnique({ where: { id: DEMO_USER_ID } })
  if (!user) {
    user = await db.user.create({
      data: {
        id: DEMO_USER_ID,
        email: DEMO_USER_EMAIL,
        name: 'Operator',
        role: 'admin',
      },
    })
  }
  return user.id
}

/**
 * Ensure the admin account exists on first production run.
 * Called on server startup when HF_PRODUCTION_MODE=true.
 * Creates the admin from ADMIN_USERNAME + ADMIN_PASSWORD env vars.
 */
export async function ensureAdminAccount(): Promise<void> {
  if (!isProductionMode()) return

  const adminEmail = process.env.ADMIN_USERNAME || 'adminmughal03'
  const adminPassword = process.env.ADMIN_PASSWORD || 'adminumair0302'
  // Normalize the email to a full address if it isn't already
  const email = adminEmail.includes('@') ? adminEmail : `${adminEmail}@agent.local`

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) return

  const passwordHash = await bcrypt.hash(adminPassword, 10)
  await db.user.create({
    data: {
      email,
      name: 'Admin',
      passwordHash,
      role: 'admin',
    },
  })
  console.log(`[auth] Admin account created: ${email}`)
}
