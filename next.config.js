/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Required on Next 14.x so src/instrumentation.ts is picked up.
  // Removed in Next 15 (it's the default).
  experimental: {
    instrumentationHook: true,
  },
}

// ───────────────────────────────────────────────────────────────────
// Sentry wrap
// Wraps the Next.js config so source maps are uploaded on every prod
// build, which makes errors in the Sentry UI human-readable.
//
// Source-map upload is a no-op without SENTRY_AUTH_TOKEN +
// SENTRY_ORG + SENTRY_PROJECT in env. Until those are set the build
// runs fine, errors are still captured (just minified line numbers).
// ───────────────────────────────────────────────────────────────────
const { withSentryConfig } = require('@sentry/nextjs')

module.exports = withSentryConfig(nextConfig, {
  // Hush the build output unless we're explicitly debugging
  silent: true,
  // Disable Sentry's auth-required steps until creds are configured.
  // Once SENTRY_AUTH_TOKEN/ORG/PROJECT are set in Vercel, source maps
  // will be uploaded automatically without changing this file.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Skip telemetry tunnel — keeps the bundle simpler
  tunnelRoute: undefined,
  // Hide source maps from the client bundle in production
  hideSourceMaps: true,
  // Disable instrumentation when no DSN is configured
  disableLogger: true,
})
