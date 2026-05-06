import { NextResponse } from 'next/server'

/**
 * GET /api/debug/env
 *
 * Returns ONLY the env vars that are safe to expose (NEXT_PUBLIC_*
 * are by definition public, and SUPABASE_URL is sniffable from any
 * client-side bundle). Helps diagnose configuration drift between
 * the self-hosted Supabase and whatever the dashboard is actually
 * pointed at.
 *
 * Never returns service role keys, JWT secrets, or anything that
 * could compromise the install.
 */

export async function GET() {
  return NextResponse.json({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    has_anon_key: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    has_service_role: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    vercel_env: process.env.VERCEL_ENV ?? null,
    vercel_url: process.env.VERCEL_URL ?? null,
    node_env: process.env.NODE_ENV ?? null,
  })
}
