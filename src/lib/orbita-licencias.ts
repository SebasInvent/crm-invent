/**
 * Órbita · licencias. Control is the administrator's panel: it talks to the license server (a Cloudflare Worker that
 * lives outside this repo) with an admin key that never reaches the browser.
 *
 * Env (Vercel):
 *   ORBITA_LICENCIAS_URL          base URL of the Worker, e.g. https://orbita-licencias.<account>.workers.dev
 *   ORBITA_LICENCIAS_ADMIN_TOKEN  the Worker's ADMIN_TOKEN (32+ characters)
 *   ORBITA_ADMIN_EMAILS           comma-separated emails allowed to manage licenses. Empty = nobody (fails closed).
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'

export function allowedEmails(): string[] {
  return (process.env.ORBITA_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/** Logged in AND listed in ORBITA_ADMIN_EMAILS. Anyone else gets 401/403, also other Control users. */
export async function requireOrbitaAdmin(): Promise<{ error: NextResponse | null; email: string | null }> {
  const auth = await requireAuth()
  if (auth.error) return { error: auth.error, email: null }
  const email = (auth.user.email || '').toLowerCase()
  if (!email || !allowedEmails().includes(email)) {
    return { error: NextResponse.json({ error: 'No tienes permiso para administrar licencias de Órbita.' }, { status: 403 }), email: null }
  }
  if (!process.env.ORBITA_LICENCIAS_URL || (process.env.ORBITA_LICENCIAS_ADMIN_TOKEN || '').length < 32) {
    return { error: NextResponse.json({ error: 'Falta configurar el servidor de licencias en Vercel.' }, { status: 503 }), email: null }
  }
  return { error: null, email }
}

/** Forward one admin call to the Worker and hand its answer back as is (status and JSON). */
export async function orbitaAdmin(path: string, init: { method?: string; body?: unknown } = {}): Promise<NextResponse> {
  const base = (process.env.ORBITA_LICENCIAS_URL || '').replace(/\/$/, '')
  try {
    const r = await fetch(base + path, {
      method: init.method || 'GET',
      headers: {
        Authorization: 'Bearer ' + process.env.ORBITA_LICENCIAS_ADMIN_TOKEN,
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    })
    const data = await r.json().catch(() => ({ error: 'Respuesta inválida del servidor de licencias' }))
    return NextResponse.json(data, { status: r.status })
  } catch {
    return NextResponse.json({ error: 'No hay conexión con el servidor de licencias.' }, { status: 502 })
  }
}

/** Ids the Worker issues: anything else never leaves Control. */
export const LICENSE_ID = /^lic_[a-z0-9]{12}$/
export const ACTIVATION_ID = /^act_[a-z0-9]{12}$/
