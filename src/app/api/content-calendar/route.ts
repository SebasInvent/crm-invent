import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/api-auth'

/**
 * GET /api/content-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Devuelve el estado real de cada pieza programada por la fábrica Dits
 * (tabla content_calendar del Supabase compartido). Alimenta el tracker
 * de publicación del CRM: el "check ✓" que confirma cada post/reel/story.
 *
 * content_calendar la escribe el pipeline de Dits y la marca el cron pub.js
 * (status: scheduled → publishing → published/failed, + published_id de IG).
 * Se lee con service-role (la tabla no vive bajo el modelo multi-tenant del CRM).
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const url = new URL(request.url)
  const from = url.searchParams.get('from') || '2026-07-01'
  const to = url.searchParams.get('to') || '2026-09-01'

  try {
    const supabase = getServiceRoleClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('content_calendar') as any)
      .select('id, title, scheduled_at, channel, format, asset_urls, caption, status, published_id, error, dry_run, funnel_stage')
      .gte('scheduled_at', `${from}T00:00:00Z`)
      .lt('scheduled_at', `${to}T00:00:00Z`)
      .order('scheduled_at', { ascending: true })

    if (error) {
      return NextResponse.json({ error: 'No se pudo leer el calendario' }, { status: 500 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data as any[]) || []
    const summary = {
      total: rows.length,
      published: rows.filter((r) => r.status === 'published').length,
      scheduled: rows.filter((r) => r.status === 'scheduled').length,
      publishing: rows.filter((r) => r.status === 'publishing').length,
      failed: rows.filter((r) => r.status === 'failed' || r.status === 'error').length,
      draft: rows.filter((r) => r.status === 'draft').length,
    }
    return NextResponse.json({ rows, summary })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
