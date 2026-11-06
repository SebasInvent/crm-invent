import { NextResponse } from 'next/server'
import { requireOrbitaAdmin, orbitaAdmin } from '@/lib/orbita-licencias'

export const dynamic = 'force-dynamic'

/** Every Órbita license with its activations (one per PC), plus the latest events. */
export async function GET() {
  const { error } = await requireOrbitaAdmin()
  if (error) return error
  const [lic, ev] = await Promise.all([orbitaAdmin('/admin/licencias'), orbitaAdmin('/admin/eventos')])
  if (!lic.ok) return lic
  const licencias = await lic.json()
  const eventos = ev.ok ? await ev.json() : { eventos: [] }
  return NextResponse.json({ ...licencias, ...eventos })
}

/** New license: { cliente, nota?, maxEquipos?, vence? }. The key in clear comes back only in this answer. */
export async function POST(request: Request) {
  const { error } = await requireOrbitaAdmin()
  if (error) return error
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  const { cliente, nota, maxEquipos, vence } = body as Record<string, unknown>
  return orbitaAdmin('/admin/licencias', { method: 'POST', body: { cliente, nota, maxEquipos, vence } })
}
