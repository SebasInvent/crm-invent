import { NextResponse } from 'next/server'
import { requireOrbitaAdmin, orbitaAdmin, ACTIVATION_ID } from '@/lib/orbita-licencias'

export const dynamic = 'force-dynamic'

/** Turn one PC on or off: { estado: 'activa' | 'desactivada' }. Takes effect on that PC's next hand. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { error } = await requireOrbitaAdmin()
  if (error) return error
  if (!ACTIVATION_ID.test(params.id)) return NextResponse.json({ error: 'Activación inválida' }, { status: 400 })
  const body = await request.json().catch(() => null)
  const estado = (body as { estado?: unknown } | null)?.estado
  if (estado !== 'activa' && estado !== 'desactivada') return NextResponse.json({ error: 'Estado: activa o desactivada.' }, { status: 400 })
  return orbitaAdmin('/admin/activaciones/' + params.id, { method: 'PATCH', body: { estado } })
}
