/**
 * GET /api/health
 *
 * Lightweight health check endpoint for UptimeRobot.
 * Returns 200 OK instantly — no DB queries, no AI calls.
 * UptimeRobot pings this every 5 min to keep the HuggingFace Space awake.
 */
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
}
