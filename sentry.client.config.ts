// Sentry — browser SDK config.
//
// Loaded automatically by @sentry/nextjs on the client. The DSN comes
// from NEXT_PUBLIC_SENTRY_DSN so it's fine to expose (DSNs are
// project-public — they can only ingest, not read).
//
// If the DSN env var is not set, the SDK is initialized with a noop
// transport — nothing is sent, but the calls don't throw. Easy
// graceful degradation when running locally without observability.

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    // Environment tagging
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    // Sample 10% of error transactions and full error capture. Tune
    // when traffic actually picks up.
    tracesSampleRate: 0.1,
    // Replay — 0% on session, 100% on error. Cheap insurance for
    // reproducing production bugs without recording everyone all the time.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    // Hide noisy errors from extensions / browser environments
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications.',
      'Non-Error promise rejection captured',
    ],
  })
}
