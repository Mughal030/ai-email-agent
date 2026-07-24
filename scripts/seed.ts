/**
 * Seed script — creates a demo user, default GBOB system prompt, and
 * sample leads. The sender account auto-creates from .env SMTP creds
 * on first dashboard load (see /api/gmail/connect).
 *
 * Run with: bun run scripts/seed.ts
 */
import { PrismaClient } from '@prisma/client'
import { DEFAULT_GBOB_PROMPT } from '../src/lib/default-prompt'

const db = new PrismaClient()

const DEMO_USER_ID = 'demo-user'

async function main() {
  console.log('Seeding...')

  await db.user.upsert({
    where: { id: DEMO_USER_ID },
    update: {},
    create: {
      id: DEMO_USER_ID,
      email: 'operator@agent.local',
      name: 'Operator',
    },
  })

  const existingPrompt = await db.systemPrompt.findFirst({
    where: { userId: DEMO_USER_ID, isDefault: true },
  })
  if (!existingPrompt) {
    await db.systemPrompt.create({
      data: {
        userId: DEMO_USER_ID,
        name: 'GBOB Default',
        content: DEFAULT_GBOB_PROMPT,
        isDefault: true,
      },
    })
    console.log('  + GBOB Default system prompt')
  }

  // Sample leads — diverse industries to showcase the multi-model routing
  const sampleLeads = [
    {
      name: 'Sarah Chen',
      email: 'sarah@acme.io',
      company: 'Acme',
      role: 'VP Engineering',
      industry: 'SaaS',
      companySize: '51-200',
      notes: 'Met at SaaStr 2024. Mentioned churn issues.',
    },
    {
      name: 'Marcus Rivera',
      email: 'marcus@brightside.dev',
      company: 'Brightside',
      role: 'CTO',
      industry: 'Fintech',
      companySize: '11-50',
      notes: 'Just raised Series A. Hiring aggressively.',
    },
    {
      name: 'Priya Patel',
      email: 'priya@northwind.co',
      company: 'Northwind',
      role: 'Head of Growth',
      industry: 'SaaS',
      companySize: '201-1000',
      notes: 'Active on LinkedIn. Posts about PLG.',
    },
    {
      name: 'David Kim',
      email: 'david@stackfoundry.com',
      company: 'Stack Foundry',
      role: 'Founder',
      industry: 'DevTools',
      companySize: '1-10',
      notes: 'Open-sourced a popular CLI tool.',
    },
    {
      name: 'Elena Volkova',
      email: 'elena@meridianhealth.ai',
      company: 'Meridian Health',
      role: 'Chief Medical Officer',
      industry: 'HealthTech',
      companySize: '201-1000',
      notes: 'Speaker at HLTH 2024.',
    },
  ]

  const sp = await db.systemPrompt.findFirst({
    where: { userId: DEMO_USER_ID, isDefault: true },
  })

  for (const lead of sampleLeads) {
    const existing = await db.lead.findFirst({
      where: { email: lead.email },
    })
    if (existing) continue
    await db.lead.create({
      data: {
        userId: DEMO_USER_ID,
        // Sender account gets auto-created on first dashboard load from env
        systemPromptId: sp?.id || null,
        ...lead,
        status: 'PENDING',
      },
    })
  }
  console.log(`  + ${sampleLeads.length} sample leads`)

  // Sample agent memory
  const existingMemory = await db.agentMemory.findFirst({
    where: { userId: DEMO_USER_ID },
  })
  if (!existingMemory) {
    await db.agentMemory.create({
      data: {
        userId: DEMO_USER_ID,
        scope: 'INDUSTRY',
        scopeKey: 'SaaS',
        lesson:
          'Shorter curiosity-driven subject lines (≤5 words) get ~20% more replies in the SaaS industry',
        category: 'subject_line',
        impactScore: 0.72,
        sampleSize: 28,
        positiveRate: 0.34,
        evidence: JSON.stringify({ window: 'seed-data' }),
        isActive: true,
        aiModel: 'seed',
      },
    })
    console.log('  + Sample agent memory')
  }

  console.log('Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
