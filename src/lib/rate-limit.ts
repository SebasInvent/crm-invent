/**
 * Lightweight in-memory rate limiter for webhooks and other public endpoints.
 *
 * Uses a sliding-window counter keyed by IP (or any string).
 * Note: this state lives per Node process, so it does NOT persist across
 * cold-start serverless invocations or scale across regions. For that you
 * want @upstash/ratelimit + Redis. For our current Vercel deploy with low
 * traffic, in-memory is good enough as a first line of defense against abuse.
 *
 * Usage:
 *   import { rateLimit } from '@/lib/rate-limit'
 *
 *   const limit = rateLimit(request, { window: '1m', max: 30 })
 *   if (!limit.allowed) {
 *     return NextResponse.json(
 *       { error: 'Too many requests', retryAfter: limit.retryAfter },
 *       { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
 *     )
 *   }
 */

type WindowSpec = '1s' | '10s' | '30s' | '1m' | '5m' | '15m' | '1h'

const WINDOW_MS: Record<WindowSpec, number> = {
  '1s': 1_000,
  '10s': 10_000,
  '30s': 30_000,
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
}

interface Bucket {
  hits: number[]
}

// Module-level store. Resets when the lambda cold starts.
const store = new Map<string, Bucket>()

// Periodically prune old buckets to avoid unbounded memory growth.
let lastPrune = Date.now()
function pruneIfNeeded(now: number) {
  if (now - lastPrune < 5 * 60_000) return
  for (const [key, bucket] of store) {
    bucket.hits = bucket.hits.filter((t) => now - t < 60 * 60_000)
    if (!bucket.hits.length) store.delete(key)
  }
  lastPrune = now
}

/**
 * Extract the client IP from a request, falling back to a synthetic key.
 * Works behind Vercel/Cloudflare which set x-forwarded-for / cf-connecting-ip.
 */
export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const cf = request.headers.get('cf-connecting-ip')
  if (cf) return cf
  const real = request.headers.get('x-real-ip')
  if (real) return real
  return 'unknown'
}

interface RateLimitOptions {
  window: WindowSpec
  max: number
  /**
   * Custom key. Defaults to the request's IP. Pass a route name to scope
   * the limiter so different endpoints don't share buckets.
   */
  key?: string
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfter: number // seconds until the oldest hit expires
  limit: number
}

export function rateLimit(
  request: Request,
  opts: RateLimitOptions,
): RateLimitResult {
  const now = Date.now()
  pruneIfNeeded(now)

  const ip = getClientIp(request)
  const key = `${opts.key ?? 'global'}:${ip}`
  const windowMs = WINDOW_MS[opts.window]

  let bucket = store.get(key)
  if (!bucket) {
    bucket = { hits: [] }
    store.set(key, bucket)
  }

  // Drop hits outside the window
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs)

  if (bucket.hits.length >= opts.max) {
    const oldest = bucket.hits[0]
    const retryAfter = Math.ceil((windowMs - (now - oldest)) / 1000)
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(retryAfter, 1),
      limit: opts.max,
    }
  }

  bucket.hits.push(now)
  return {
    allowed: true,
    remaining: opts.max - bucket.hits.length,
    retryAfter: 0,
    limit: opts.max,
  }
}

import { NextResponse } from 'next/server'

/**
 * Convenience wrapper that returns a 429 NextResponse if the limit is hit,
 * or null if the request is allowed.
 *
 *   const block = rateLimitOrBlock(request, { window: '1m', max: 30, key: 'telegram' })
 *   if (block) return block
 */
export function rateLimitOrBlock(
  request: Request,
  opts: RateLimitOptions,
): NextResponse | null {
  const result = rateLimit(request, opts)
  if (result.allowed) return null
  return NextResponse.json(
    { error: 'Too many requests', retryAfter: result.retryAfter },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfter),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': '0',
      },
    },
  )
}
