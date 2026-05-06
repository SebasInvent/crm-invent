import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'

/**
 * GET    /api/projects/[id]   read full project
 * PATCH  /api/projects/[id]   update fields
 * DELETE /api/projects/[id]   hard delete (cascade deletes deliverables + tasks)
 */

const projectPatchSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    status: z
      .enum(['planning', 'in_progress', 'review', 'completed', 'cancelled'])
      .optional(),
    budget: z.coerce.number().min(0).max(1_000_000_000).nullable().optional(),
    start_date: z.string().nullable().optional(),
    end_date: z.string().nullable().optional(),
    progress: z.coerce.number().int().min(0).max(100).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field required' })

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  if (!params.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('projects')
    .select('*, clients(name)')
    .eq('id', params.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true, project: data })
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 60, key: 'projects-patch' })
  if (block) return block

  const auth = await requireAuth()
  if (auth.error) return auth.error
  if (!params.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  let parsed: z.infer<typeof projectPatchSchema>
  try {
    parsed = projectPatchSchema.parse(await request.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('projects') as any)
    .update(parsed)
    .eq('id', params.id)
    .select('*')
    .single()

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, project: data })
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 30, key: 'projects-delete' })
  if (block) return block

  const auth = await requireAuth()
  if (auth.error) return auth.error
  if (!params.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = getServiceRoleClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('projects') as any).delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
