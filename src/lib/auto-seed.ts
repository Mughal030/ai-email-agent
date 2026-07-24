/**
 * ============================================================================
 * AUTO-SEED — imports previous data on first production run
 * ============================================================================
 *
 * Runs on HuggingFace Space startup. If the database is empty (first run),
 * this imports the previous sandbox data: system prompts, leads, and agent
 * memory. The data is stored in scripts/seed-data.json (committed to the
 * repo, no secrets).
 *
 * After seeding, it also creates the admin account and assigns all leads
 * to the admin user.
 * ============================================================================
 */

import { db } from '@/lib/db'
import { ensureAdminAccount } from '@/lib/auth'
import { encrypt } from '@/lib/crypto'
import { DEFAULT_GBOB_PROMPT } from '@/lib/default-prompt'
import { readFileSync } from 'fs'
import { join } from 'path'

interface SeedData {
  systemPrompts: Array<{
    name: string
    content: string
    isDefault: boolean
  }>
  leads: Array<{
    name: string
    email: string
    company: string | null
    role: string | null
    industry: string | null
    companySize: string | null
    notes: string | null
    linkedinUrl: string | null
    status: string
  }>
  agentMemory: Array<{
    scope: string
    scopeKey: string | null
    lesson: string
    category: string
    impactScore: number
    sampleSize: number
    positiveRate: number
    isActive: boolean
  }>
}

/**
 * Run the auto-seed. Only runs if the database is empty.
 * Safe to call on every startup — it's a no-op if data already exists.
 */
export async function autoSeed(): Promise<void> {
  // Check if already seeded (any leads exist for any user)
  const existingLeads = await db.lead.count()
  if (existingLeads > 0) {
    console.log('[auto-seed] Database already has data — skipping seed')
    return
  }

  // Ensure admin account exists
  const adminId = await ensureAdminAccount()
  console.log(`[auto-seed] Admin user: ${adminId}`)

  // Load seed data
  let seedData: SeedData
  try {
    const seedPath = join(process.cwd(), 'scripts', 'seed-data.json')
    const raw = readFileSync(seedPath, 'utf-8')
    seedData = JSON.parse(raw)
  } catch (e) {
    console.error('[auto-seed] No seed-data.json found — skipping import')
    return
  }

  console.log(
    `[auto-seed] Importing: ${seedData.systemPrompts.length} prompts, ` +
    `${seedData.leads.length} leads, ${seedData.agentMemory.length} memories`
  )

  // 1. Import system prompts — update the default with the latest guest posting prompt
  for (const sp of seedData.systemPrompts) {
    // If this is the default prompt, replace its content with the updated
    // guest posting services version
    const content = sp.isDefault ? DEFAULT_GBOB_PROMPT : sp.content
    await db.systemPrompt.create({
      data: {
        userId: adminId,
        name: sp.name,
        content,
        isDefault: sp.isDefault,
      },
    })
  }

  // 2. Create a GmailAccount row for the admin using env SMTP creds
  let gmailAccountId: string | null = null
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    const account = await db.gmailAccount.create({
      data: {
        userId: adminId,
        email: process.env.SMTP_USER,
        displayName: process.env.SMTP_FROM_NAME || 'AI Sales Agent',
        encryptedSmtpPass: encrypt(process.env.SMTP_PASS),
        smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
        smtpPort: Number(process.env.SMTP_PORT) || 465,
        imapHost: process.env.IMAP_HOST || 'imap.gmail.com',
        imapPort: Number(process.env.IMAP_PORT) || 993,
        isActive: true,
        // CRITICAL: Start PAUSED — user must manually click "Resume Sending"
        sendingPaused: true,
      },
    })
    gmailAccountId = account.id
    console.log(`[auto-seed] Created sender account: ${account.email}`)
  }

  // 3. Import leads (assign to admin + sender account)
  const sp = await db.systemPrompt.findFirst({
    where: { userId: adminId, isDefault: true },
  })

  let imported = 0
  let skipped = 0
  for (const lead of seedData.leads) {
    try {
      await db.lead.create({
        data: {
          userId: adminId,
          gmailAccountId,
          systemPromptId: sp?.id || null,
          name: lead.name,
          email: lead.email,
          company: lead.company,
          role: lead.role,
          industry: lead.industry,
          companySize: lead.companySize,
          notes: lead.notes,
          linkedinUrl: lead.linkedinUrl,
          // Reset all statuses to PENDING — the scheduler will re-queue them
          status: 'PENDING',
        },
      })
      imported++
    } catch (e) {
      skipped++
    }
  }
  console.log(`[auto-seed] Imported ${imported} leads (${skipped} skipped)`)

  // 4. Import agent memory
  for (const m of seedData.agentMemory) {
    await db.agentMemory.create({
      data: {
        userId: adminId,
        scope: m.scope as 'GLOBAL' | 'INDUSTRY' | 'ROLE' | 'COMPANY_SIZE',
        scopeKey: m.scopeKey,
        lesson: m.lesson,
        category: m.category,
        impactScore: m.impactScore,
        sampleSize: m.sampleSize,
        positiveRate: m.positiveRate,
        isActive: m.isActive,
      },
    })
  }

  console.log('[auto-seed] Complete!')
}
