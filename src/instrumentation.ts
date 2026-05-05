/**
 * Next.js instrumentation hook — runs once per server start.
 * Loads the right Sentry config based on the runtime so server and
 * edge handlers both get tracked from their own SDK.
 *
 * Browser-side init lives in /sentry.client.config.ts and is
 * automatically picked up by @sentry/nextjs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
}
