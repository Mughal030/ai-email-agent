/**
 * Next.js Instrumentation — runs once on server startup.
 *
 * 1. Runs startup catchup (scans inbox for missed replies while server was down)
 * 2. Starts the production scheduler (full tick every 5 min + fast reply poll every 60s)
 * 3. In production mode: creates admin account + imports previous data on first run
 */

export async function register() {
  // Only run on the server (not during build)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 1. Run startup catchup FIRST — process any replies that arrived
    //    while the server was down (before sending new emails)
    try {
      const { runStartupCatchup } = await import('./lib/agent/catchup')
      runStartupCatchup() // fire and forget (runs async after 10s delay)
    } catch (e) {
      console.error('[instrumentation] catchup failed to start:', e)
    }

    // 2. Start the production scheduler (full tick + fast reply poll)
    const { startScheduler } = await import('./lib/agent/prod-scheduler')
    startScheduler()

    // 3. In production: create admin + auto-seed previous data
    if (process.env.HF_PRODUCTION_MODE === 'true') {
      try {
        const { autoSeed } = await import('./lib/auto-seed')
        await autoSeed()
      } catch (e) {
        console.error('[instrumentation] auto-seed failed:', e)
      }
    }
  }
}
