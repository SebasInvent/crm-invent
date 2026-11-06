import { NextResponse } from 'next/server'
import { requireOrbitaAdmin, orbitaAdmin, LICENSE_ID } from '@/lib/orbita-licencias'

export const dynamic = 'force-dynamic'

/** Change a license: { estado?: 'activa'|'suspendida'|'revocada', vence?, maxEquipos?, cliente?, nota? }. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { error } = await requireOrbitaAdmin()
  if (error) return error
  if (!LICENSE_ID.test(params.id)) return NextResponse.json({ error: 'Licencia inválida' }, { status: 400 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  const { estado, vence, maxEquipos, cliente, nota } = body as Record<string, unknown>
  return orbitaAdmin('/admin/licencias/' + params.id, { method: 'PATCH', body: { estado, vence, maxEquipos, cliente, nota } })
}
