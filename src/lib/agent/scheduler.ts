/**
 * ============================================================================
 * SMART SEND SCHEDULER
 * ============================================================================
 *
 * Decides WHEN each queued lead should be sent, based on:
 *
 *   1. DAILY LIMIT — never send more than `dailySendLimit` per day
 *      (default 50, well under Gmail's ~500 cap)
 *   2. SEND WINDOW — only send during business hours in the sender's
 *      timezone (default 9 AM – 5 PM)
 *   3. MIN GAP — minimum `minMinutesBetweenSends` between consecutive
 *      sends (anti-spam, default 3 min)
 *   4. REGION-AWARE TIMING — if we can infer the lead's region from
 *      their location/notes, send at their local morning (9-11 AM)
 *      which is statistically the best time for cold outreach
 *
 * Best-time-of-day research (industry consensus):
 *   - Tuesday–Thursday: highest reply rates
 *   - 9–11 AM local time: peak open rate (people check email first thing)
 *   - 1–3 PM local time: secondary peak (post-lunch inbox check)
 *   - Avoid: Monday mornings (inbox triage), Friday afternoons (checked out),
 *     weekends, and after 5 PM
 *
 * Approach:
 *   - For each new QUEUED lead, compute scheduledFor = next available
 *     send slot in the sender's send window, adjusted for the lead's
 *     inferred region if possible.
 *   - The agent tick then only sends leads whose scheduledFor <= now
 *     and the sender's daily quota isn't exhausted.
 * ============================================================================
 */

import { db } from '@/lib/db'
import type { GmailAccount, Lead } from '@prisma/client'

// ---------------------------------------------------------------------------
// 1. TIMEZONE / REGION HELPERS
// ---------------------------------------------------------------------------

/** Common region → timezone mapping (best-effort, from location string). */
const REGION_TZ: Array<{ pattern: RegExp; tz: string; offsetHours: number }> = [
  // US
  { pattern: /united states|usa|u\.s\.|new york|california|san francisco|los angeles|chicago|texas|houston|boston|seattle|florida|miami/i, tz: 'America/New_York', offsetHours: -5 },
  { pattern: /pacific|pst|pdt|portland|denver|phoenix|las vegas/i, tz: 'America/Los_Angeles', offsetHours: -8 },
  { pattern: /central|cst|cdt|dallas|austin|atlanta|minneapolis/i, tz: 'America/Chicago', offsetHours: -6 },
  { pattern: /mountain|mst|mdt|salt lake|boise/i, tz: 'America/Denver', offsetHours: -7 },
  // Canada
  { pattern: /canada|toronto|vancouver|montreal|ottawa|calgary/i, tz: 'America/Toronto', offsetHours: -5 },
  // UK/Europe
  { pattern: /united kingdom|uk|england|london|britain/i, tz: 'Europe/London', offsetHours: 0 },
  { pattern: /germany|berlin|munich|frankfurt/i, tz: 'Europe/Berlin', offsetHours: 1 },
  { pattern: /france|paris/i, tz: 'Europe/Paris', offsetHours: 1 },
  { pattern: /netherlands|amsterdam/i, tz: 'Europe/Amsterdam', offsetHours: 1 },
  { pattern: /spain|madrid|barcelona/i, tz: 'Europe/Madrid', offsetHours: 1 },
  { pattern: /italy|rome|milan/i, tz: 'Europe/Rome', offsetHours: 1 },
  { pattern: /sweden|stockholm/i, tz: 'Europe/Stockholm', offsetHours: 1 },
  { pattern: /ireland|dublin/i, tz: 'Europe/Dublin', offsetHours: 0 },
  // Asia
  { pattern: /india|mumbai|delhi|bangalore|pune|hyderabad|chennai/i, tz: 'Asia/Kolkata', offsetHours: 5.5 },
  { pattern: /singapore/i, tz: 'Asia/Singapore', offsetHours: 8 },
  { pattern: /japan|tokyo|osaka/i, tz: 'Asia/Tokyo', offsetHours: 9 },
  { pattern: /china|beijing|shanghai|shenzhen/i, tz: 'Asia/Shanghai', offsetHours: 8 },
  { pattern: /hong kong|hk/i, tz: 'Asia/Hong_Kong', offsetHours: 8 },
  { pattern: /dubai|uae|emirates/i, tz: 'Asia/Dubai', offsetHours: 4 },
  { pattern: /israel|tel aviv|jerusalem/i, tz: 'Asia/Jerusalem', offsetHours: 2 },
  // Australia / NZ
  { pattern: /australia|sydney|melbourne|brisbane|perth/i, tz: 'Australia/Sydney', offsetHours: 10 },
  { pattern: /new zealand|auckland|wellington/i, tz: 'Pacific/Auckland', offsetHours: 12 },
  // LATAM
  { pattern: /brazil|sao paulo|rio/i, tz: 'America/Sao_Paulo', offsetHours: -3 },
  { pattern: /mexico|mexico city/i, tz: 'America/Mexico_City', offsetHours: -6 },
  { pattern: /argentina|buenos aires/i, tz: 'America/Argentina/Buenos_Aires', offsetHours: -3 },
]

/**
 * Infer the lead's timezone from their notes/location field.
 * Returns the timezone offset (in hours from UTC) or null if unknown.
 */
export function inferLeadTimezoneOffset(lead: Pick<Lead, 'notes' | 'industry'>): number | null {
  const text = lead.notes || ''
  // Look for a city/country mention
  for (const { pattern, offsetHours } of REGION_TZ) {
    if (pattern.test(text)) return offsetHours
  }
  return null
}

// ---------------------------------------------------------------------------
// 2. SCHEDULER — compute next send slot for a lead
// ---------------------------------------------------------------------------

/**
 * Compute the next available send time for a lead, respecting:
 *   - sender's daily limit
 *   - sender's send window (business hours)
 *   - lead's region (try to hit their local 9-11 AM)
 *   - min gap between sends
 *
 * Returns a Date that becomes the lead's `scheduledFor`.
 */
export async function computeNextSendTime(
  account: GmailAccount,
  lead: Pick<Lead, 'notes' | 'industry'>,
  options: { fromDate?: Date } = {}
): Promise<Date> {
  const now = options.fromDate || new Date()
  const startHour = account.sendWindowStartHour
  const endHour = account.sendWindowEndHour

  // Step 1: find the next day with remaining quota
  let candidate = new Date(now)
  let attempts = 0
  while (attempts < 14) {
    // Skip weekends (Saturday=6, Sunday=0) — cold outreach on weekends underperforms
    const day = candidate.getDay()
    if (day === 0 || day === 6) {
      candidate.setDate(candidate.getDate() + 1)
      candidate.setHours(startHour, 0, 0, 0)
      attempts++
      continue
    }

    // Check quota for this day
    const dayStart = new Date(candidate)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(candidate)
    dayEnd.setHours(23, 59, 59, 999)

    const sentToday = await db.emailLog.count({
      where: {
        gmailAccountId: account.id,
        direction: 'OUTREACH',
        status: 'SENT',
        sentAt: { gte: dayStart, lte: dayEnd },
      },
    })

    if (sentToday >= account.dailySendLimit) {
      // Move to next day
      candidate.setDate(candidate.getDate() + 1)
      candidate.setHours(startHour, 0, 0, 0)
      attempts++
      continue
    }

    // Step 2: find the next available slot in today's send window
    // Adjust the window for the lead's timezone if we can infer it
    let effectiveStartHour = startHour
    let effectiveEndHour = endHour
    const leadOffset = inferLeadTimezoneOffset(lead)
    if (leadOffset !== null) {
      // Compute sender's offset from the lead's offset, then shift the
      // lead's local 9-11 AM window into the sender's local time
      // For simplicity, we target the lead's local 9 AM
      // Sender tz offset (rough): from senderTimezone string
      const senderOffset = getTzOffsetHours(account.senderTimezone, candidate)
      const offsetDiff = senderOffset - leadOffset // hours
      // If lead is 5.5 hours ahead of sender, lead's 9 AM = sender's 3:30 AM
      // We want to send at lead's 9 AM, which is sender's (9 - offsetDiff) AM
      const targetLeadLocalHour = 9 // peak open rate
      effectiveStartHour = Math.floor(targetLeadLocalHour - offsetDiff)
      effectiveEndHour = effectiveStartHour + 2 // 2-hour window

      // Normalize negative or >24 hours
      if (effectiveStartHour < 0) effectiveStartHour += 24
      if (effectiveEndHour > 24) effectiveEndHour -= 24

      // If the computed window is outside the sender's working hours entirely,
      // fall back to the sender's default window
      if (effectiveEndHour < startHour || effectiveStartHour > endHour) {
        effectiveStartHour = startHour
        effectiveEndHour = endHour
      }
    }

    // Find the latest already-scheduled send for this day to enforce min gap
    const daySchedules = await db.lead.findMany({
      where: {
        gmailAccountId: account.id,
        status: 'QUEUED',
        scheduledFor: { gte: dayStart, lte: dayEnd },
      },
      select: { scheduledFor: true },
      orderBy: { scheduledFor: 'desc' },
    })

    // Find next slot >= max(now, window start, last scheduled + min gap)
    const windowStart = new Date(candidate)
    windowStart.setHours(effectiveStartHour, 0, 0, 0)
    const windowEnd = new Date(candidate)
    windowEnd.setHours(effectiveEndHour, 0, 0, 0)

    // If window wraps midnight, handle it
    let slot = new Date(Math.max(now.getTime(), windowStart.getTime()))
    if (slot > windowEnd && effectiveEndHour > effectiveStartHour) {
      // Past today's window — move to next day
      candidate.setDate(candidate.getDate() + 1)
      candidate.setHours(startHour, 0, 0, 0)
      attempts++
      continue
    }

    // Apply min gap from the last scheduled send
    if (daySchedules.length > 0) {
      const lastScheduled = daySchedules[0].scheduledFor!
      const minGapMs = account.minMinutesBetweenSends * 60 * 1000
      const earliestAfterLast = new Date(lastScheduled.getTime() + minGapMs)
      if (slot < earliestAfterLast) {
        slot = new Date(earliestAfterLast)
      }
    }

    // If slot is past the window end, move to next day
    if (slot > windowEnd && effectiveEndHour > effectiveStartHour) {
      candidate.setDate(candidate.getDate() + 1)
      candidate.setHours(startHour, 0, 0, 0)
      attempts++
      continue
    }

    return slot
  }

  // Fallback: schedule for tomorrow at start hour
  const fallback = new Date(now)
  fallback.setDate(fallback.getDate() + 1)
  fallback.setHours(startHour, 0, 0, 0)
  return fallback
}

/** Get the UTC offset (in hours) for a timezone at a given date. */
function getTzOffsetHours(tz: string, date: Date): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    })
    const parts = formatter.formatToParts(date)
    const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value || ''
    // offsetPart is like "GMT-5" or "GMT+5:30"
    const match = offsetPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
    if (!match) return 0
    const sign = match[1] === '+' ? 1 : -1
    const hours = parseInt(match[2], 10)
    const minutes = match[3] ? parseInt(match[3], 10) : 0
    return sign * (hours + minutes / 60)
  } catch {
    return 0
  }
}

// ---------------------------------------------------------------------------
// 3. CHECKS — can we send right now?
// ---------------------------------------------------------------------------

export interface SendGuardResult {
  allowed: boolean
  reason: string
  remainingToday: number
}

/**
 * Check whether a sender account is allowed to send another email right now.
 */
export async function canSendNow(account: GmailAccount): Promise<SendGuardResult> {
  // Master pause switch
  if (account.sendingPaused) {
    return { allowed: false, reason: 'Sending is paused', remainingToday: 0 }
  }
  if (!account.isActive) {
    return { allowed: false, reason: 'Account is inactive', remainingToday: 0 }
  }

  // Reset sentToday if it's a new day
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (!account.sentDate || account.sentDate < today) {
    await db.gmailAccount.update({
      where: { id: account.id },
      data: { sentToday: 0, sentDate: today },
    })
    account.sentToday = 0
  }

  // Daily limit check
  if (account.sentToday >= account.dailySendLimit) {
    return {
      allowed: false,
      reason: `Daily limit reached (${account.dailySendLimit}/day)`,
      remainingToday: 0,
    }
  }

  // Send window check (sender's local time)
  const senderHour = getHourInTimezone(account.senderTimezone, new Date())
  if (senderHour < account.sendWindowStartHour || senderHour >= account.sendWindowEndHour) {
    return {
      allowed: false,
      reason: `Outside send window (${account.sendWindowStartHour}:00-${account.sendWindowEndHour}:00 ${account.senderTimezone})`,
      remainingToday: account.dailySendLimit - account.sentToday,
    }
  }

  return {
    allowed: true,
    reason: 'OK',
    remainingToday: account.dailySendLimit - account.sentToday,
  }
}

function getHourInTimezone(tz: string, date: Date): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    })
    const parts = formatter.formatToParts(date)
    const hourPart = parts.find((p) => p.type === 'hour')?.value || '0'
    return parseInt(hourPart, 10)
  } catch {
    return date.getHours()
  }
}

// ---------------------------------------------------------------------------
// 4. BULK SCHEDULE — assign scheduledFor to all QUEUED leads
// ---------------------------------------------------------------------------

/**
 * For all QUEUED leads without a scheduledFor, compute and assign one.
 * Called after bulk-queuing leads so the schedule table is populated.
 */
export async function scheduleAllQueuedLeads(userId: string): Promise<{
  scheduled: number
  firstSendAt: Date | null
  lastSendAt: Date | null
}> {
  const account = await db.gmailAccount.findFirst({
    where: { userId, isActive: true },
  })
  if (!account) {
    return { scheduled: 0, firstSendAt: null, lastSendAt: null }
  }

  // Find all QUEUED leads that don't have a scheduledFor yet
  const unscheduled = await db.lead.findMany({
    where: {
      userId,
      status: 'QUEUED',
      scheduledFor: null,
    },
    orderBy: { queuedAt: 'asc' },
    take: 500,
  })

  let lastSlot = new Date()
  let scheduled = 0
  let firstSendAt: Date | null = null
  let lastSendAt: Date | null = null

  for (const lead of unscheduled) {
    // Compute next slot starting from the last slot we assigned
    // (so leads spread across the day, not all clumped at 9 AM)
    const slot = await computeNextSendTime(account, lead, {
      fromDate: new Date(lastSlot.getTime() + account.minMinutesBetweenSends * 60 * 1000),
    })
    await db.lead.update({
      where: { id: lead.id },
      data: { scheduledFor: slot },
    })
    lastSlot = slot
    scheduled++
    if (!firstSendAt) firstSendAt = slot
    lastSendAt = slot
  }

  return { scheduled, firstSendAt, lastSendAt }
}
