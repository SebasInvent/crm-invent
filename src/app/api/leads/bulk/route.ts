import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { rateLimitOrBlock } from '@/lib/rate-limit'
import { getServiceRoleClient } from '@/lib/supabase'
import { recordActivity, type ActivityType } from '@/lib/activity-log'

/**
 * POST /api/leads/bulk
 *
 * Apply a bulk operation to a list of leads. Supported actions:
 *
 *   - change_status     value ∈ {hot, warm, cold, dead, converted}
 *   - change_priority   value ∈ {critical, high, medium, low}
 *   - archive           shortcut for change_status=dead
 *   - delete            hard delete (RLS bypassed via service role)
 *
 * Body:
 *   { ids: string[]    (1..100 UUIDs)
 *     action: ...
 *     value?: string   (required for change_*) }
 */

const idsSchema = z.array(z.string().uuid()).min(1).max(100)

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('change_status'),
    ids: idsSchema,
    value: z.enum(['hot', 'warm', 'cold', 'dead', 'converted']),
  }),
  z.object({
    action: z.literal('change_priority'),
    ids: idsSchema,
    value: z.enum(['critical', 'high', 'medium', 'low']),
  }),
  z.object({
    action: z.literal('archive'),
    ids: idsSchema,
  }),
  z.object({
    action: z.literal('delete'),
    ids: idsSchema,
  }),
])

export async function POST(request: Request) {
  const block = rateLimitOrBlock(request, { window: '1m', max: 30, key: 'leads-bulk' })
  if (block) return block

  const auth = await requireAuth()
  if (auth.error) return auth.error

  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await request.json())
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof Error ? err.message : 'parse failed' },
      { status: 400 },
    )
  }

  const supabase = getServiceRoleClient()

  try {
    let affected = 0

    if (parsed.action === 'delete') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error, count } = await (supabase.from('leads') as any)
        .delete({ count: 'exact' })
        .in('id', parsed.ids)
      if (error) throw new Error(error.message)
      affected = count ?? parsed.ids.length
    } else {
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }
      if (parsed.action === 'change_status') patch.lead_status = parsed.value
      else if (parsed.action === 'change_priority') patch.priority = parsed.value
      else if (parsed.action === 'archive') patch.lead_status = 'dead'

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error, count } = await (supabase.from('leads') as any)
        .update(patch, { count: 'exact' })
        .in('id', parsed.ids)
      if (error) throw new Error(error.message)
      affected = count ?? parsed.ids.length
    }

    // Audit: one activity_log per affected lead. Type maps to the
    // closest enum value so the timeline icon picks up the right
    // semantics.
    const typeMap: Record<typeof parsed.action, ActivityType> = {
      change_status: 'lead_status_change',
      change_priority: 'lead_priority_change',
      archive: 'lead_archived',
      delete: 'lead_deleted',
    }
    const activityType = typeMap[parsed.action]
    const valueLabel = parsed.action === 'archive'
      ? 'dead'
      : parsed.action === 'delete'
        ? null
        : (parsed as any).value
    for (const id of parsed.ids) {
      recordActivity(supabase, {
        lead_id: id,
        activity_type: activityType,
        title:
          parsed.action === 'delete'
            ? 'Lead eliminado (bulk)'
            : parsed.action === 'archive'
              ? 'Lead archivado (bulk)'
              : `${parsed.action === 'change_status' ? 'Estado' : 'Prioridad'} cambiado a ${valueLabel} (bulk)`,
        description: `Operación en lote sobre ${parsed.ids.length} leads.`,
        metadata: {
          actor_user_id: auth.user.id,
          actor_email: auth.user.email,
          bulk: true,
          new_value: valueLabel,
        },
      })
    }

    return NextResponse.json({
      ok: true,
      action: parsed.action,
      affected,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    return NextResponse.json({ error: 'Bulk failed', details: msg }, { status: 500 })
  }
}
