// Sentry — Node.js server runtime (API routes + server components).
//
// SENTRY_DSN is server-only so it's not bundled into the client.
// Falls back to NEXT_PUBLIC_SENTRY_DSN if a separate server DSN
// isn't set — for a single-project setup that's fine.

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    // Don't spam Sentry with expected 4xx response errors. Real bugs
    // are 5xx and uncaught throws, both still captured by default.
    ignoreErrors: ['Unauthorized', 'Forbidden', 'Too many requests'],
  })
}
