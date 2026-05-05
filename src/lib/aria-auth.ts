import { NextResponse } from 'next/server'

/**
 * Aria action endpoints are called by the n8n workflow on behalf of
 * Sebastian — no logged-in browser session. They authenticate via a
 * shared secret stored as `ARIA_ACTION_TOKEN` in Vercel env vars and
 * mirrored in the n8n workflow.
 *
 * The shared-secret approach is fine here because:
 *   - The token never touches the browser (only server-to-server)
 *   - We rotate it on demand by changing the env var on both sides
 *   - We layer rate-limiting on top (`/lib/rate-limit`)
 *
 * Helper returns either:
 *   - { error: NextResponse } when invalid → return it from your handler
 *   - { error: null }         when valid → keep going
 */

export function requireAriaAuth(request: Request):
  | { error: NextResponse }
  | { error: null } {
  const expected = process.env.ARIA_ACTION_TOKEN
  if (!expected) {
    console.error('ARIA_ACTION_TOKEN not set — refusing all Aria action requests')
    return {
      error: NextResponse.json(
        { error: 'Aria actions are not configured', hint: 'Admin must set ARIA_ACTION_TOKEN' },
        { status: 503 },
      ),
    }
  }

  // Accept token via Authorization: Bearer ... or X-Aria-Token header
  const authHeader = request.headers.get('authorization') || ''
  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : null
  const headerToken = request.headers.get('x-aria-token')
  const provided = bearer || headerToken

  if (!provided) {
    return {
      error: NextResponse.json({ error: 'Missing Aria token' }, { status: 401 }),
    }
  }

  // Constant-time comparison to avoid timing attacks
  if (provided.length !== expected.length) {
    return {
      error: NextResponse.json({ error: 'Invalid Aria token' }, { status: 401 }),
    }
  }
  let diff = 0
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  if (diff !== 0) {
    return {
      error: NextResponse.json({ error: 'Invalid Aria token' }, { status: 401 }),
    }
  }

  return { error: null }
}

/**
 * Lightweight audit logger. For now this just goes to console (Vercel
 * logs) — easy to upgrade later to write rows in `aria_action_logs`.
 */
export function logAriaAction(action: string, payload: unknown, result: 'ok' | 'error', error?: string) {
  // eslint-disable-next-line no-console
  console.log('[aria-action]', JSON.stringify({
    ts: new Date().toISOString(),
    action,
    result,
    error,
    payload,
  }))
}
