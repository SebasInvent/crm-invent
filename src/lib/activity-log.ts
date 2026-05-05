/**
 * Activity log helper — write a structured event into `activity_logs`
 * after a successful mutation. Used by API routes (leads, deals, bulk,
 * Aria actions) to produce a rich timeline.
 *
 * Design choices:
 *
 *   - Failure is silent. If the activity_logs insert errors, we log
 *     to the console but don't break the calling mutation. The user's
 *     primary action already succeeded; the event log is best-effort.
 *
 *   - Async fire-and-forget pattern. The caller doesn't have to await
 *     this — it returns void. We `void`-prefix the call so the lint
 *     rule about un-awaited promises stays clean.
 *
 *   - Caller passes a service-role supabase client. The helper does
 *     not create one because the calling route already has one and
 *     passing it lets tests inject a mock.
 *
 * Schema: activity_logs has contact_id, deal_id, lead_id (after
 * migration 004). Pass at least one of those.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export type ActivityType =
  | 'note'
  | 'email'
  | 'call'
  | 'meeting'
  | 'task_completed'
  | 'stage_change'
  | 'deal_created'
  | 'deal_won'
  | 'deal_lost'
  | 'web_visit'
  | 'document_viewed'
  | 'proposal_sent'
  | 'conversation'
  | 'telegram_message'
  | 'whatsapp_message'
  | 'lead_created'
  | 'lead_status_change'
  | 'lead_score_change'
  | 'lead_priority_change'
  | 'lead_archived'
  | 'lead_deleted'
  | 'lead_follow_up_set'
  | 'deal_moved'
  | 'deal_value_change'
  | 'deal_assigned'
  | 'bulk_operation'

export interface RecordActivityInput {
  /** One of these scopes the event to a specific entity */
  contact_id?: string | null
  deal_id?: string | null
  lead_id?: string | null
  /** Discriminator: must match the CHECK constraint */
  activity_type: ActivityType
  /** Short headline shown in the timeline */
  title: string
  /** Optional body — markdown-ish plain text */
  description?: string | null
  /** Free-form payload, useful for debugging or future enrichment */
  metadata?: Record<string, unknown>
}

export function recordActivity(
  supabase: SupabaseLike,
  input: RecordActivityInput,
): void {
  // Validate at least one parent
  if (!input.contact_id && !input.deal_id && !input.lead_id) {
    // eslint-disable-next-line no-console
    console.warn('[activity-log] skipped: no parent id', input)
    return
  }

  const row = {
    contact_id: input.contact_id ?? null,
    deal_id: input.deal_id ?? null,
    lead_id: input.lead_id ?? null,
    activity_type: input.activity_type,
    title: input.title,
    description: input.description ?? null,
    metadata: input.metadata ?? {},
  }

  // Fire and forget — this should never block the caller. If the
  // insert fails (e.g. CHECK constraint mismatch, column missing
  // before migration runs), we log and move on.
  void (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('activity_logs') as any).insert(row)
      if (error) {
        // eslint-disable-next-line no-console
        console.warn('[activity-log] insert failed:', error.message, row)
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[activity-log] threw:', err)
    }
  })()
}
