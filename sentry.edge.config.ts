// Sentry — Vercel Edge runtime (middleware + edge route handlers).
//
// We don't have edge handlers today, but Sentry's wizard expects this
// file to exist so adding it now avoids a future rewire.

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  })
}
