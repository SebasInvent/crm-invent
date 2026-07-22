import { recordActivity } from '@/lib/activity-log'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export const QUALIFICATION_NOTIFIED_TAG = 'qualification-notified'

type QualificationLead = {
  id: string
  name: string
  phone?: string | null
  company?: string | null
  location?: string | null
  lead_score?: number | null
  lead_status?: string | null
  tags?: string[] | null
  notes?: string | null
}

type QualificationResult = {
  sent: boolean
  already_notified?: boolean
  error?: string
}

const cleanPhone = (value: unknown) => {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`
  return digits
}

/**
 * Synchronize the lead/thread qualification and notify Sebastian once.
 * The notification uses the same Evolution instance already configured for
 * manual CRM WhatsApp messages. A durable tag prevents duplicate alerts when
 * the lead is saved or re-qualified more than once.
 */
export async function notifyQualifiedLead(
  supabase: SupabaseLike,
  lead: QualificationLead,
  source: 'control' | 'agent',
): Promise<QualificationResult> {
  const currentTags = Array.isArray(lead.tags) ? lead.tags : []

  const { data: threads } = await supabase
    .from('chat_threads')
    .select('id, phone, bot_active, status')
    .eq('lead_id', lead.id)
    .order('last_message_at', { ascending: false })
    .limit(1)
  const thread = (threads ?? [])[0] as
    | { id: string; phone: string | null; bot_active: boolean; status: string }
    | undefined

  if (thread?.id) {
    await supabase.from('chat_threads').update({ status: 'qualified' } as never).eq('id', thread.id)
  }

  if (currentTags.includes(QUALIFICATION_NOTIFIED_TAG)) {
    return { sent: false, already_notified: true }
  }

  const evolutionKey = process.env.EVOLUTION_API_KEY
  if (!evolutionKey) return { sent: false, error: 'EVOLUTION_API_KEY no está configurada' }

  let transcript = 'Sin conversación registrada todavía.'
  if (thread?.id) {
    const { data: messages } = await supabase
      .from('chat_messages')
      .select('direction, sender, content, created_at')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: false })
      .limit(8)
    const rows = [...(messages ?? [])].reverse() as Array<{
      direction: string
      sender: string
      content: string
    }>
    if (rows.length) {
      transcript = rows
        .map((row) => {
          const speaker = row.direction === 'inbound'
            ? 'Cliente'
            : row.sender === 'human'
              ? 'Sebastián'
              : 'Agente'
          return `${speaker}: ${String(row.content ?? '').replace(/\s+/g, ' ').slice(0, 240)}`
        })
        .join('\n')
    }
  }

  const phone = cleanPhone(thread?.phone || lead.phone)
  const tags = currentTags.filter((tag) => tag !== QUALIFICATION_NOTIFIED_TAG)
  const product = tags.includes('encore') ? 'Encore' : tags.includes('tickean') ? 'Tickean' : 'Por confirmar'
  const target = cleanPhone(process.env.QUALIFIED_LEAD_WHATSAPP || '573107556872')
  const crmLink = `https://control.inventagency.co/dashboard/leads/${lead.id}`
  const prospectLink = phone ? `https://wa.me/${phone}` : 'Sin teléfono confirmado'
  const message = [
    '🔥 LEAD CALIFICADO EN CONTROL',
    '',
    `Producto: ${product}`,
    `Lead: ${lead.name}`,
    `Negocio: ${lead.company || 'Por confirmar'}`,
    `Teléfono: ${phone ? `+${phone}` : 'Por confirmar'}`,
    `Ubicación: ${lead.location || 'Por confirmar'}`,
    `Score: ${lead.lead_score ?? 70}/100`,
    `Origen de calificación: ${source === 'agent' ? 'Agente de WhatsApp' : 'Control Invent Agency'}`,
    '',
    'Últimos mensajes:',
    transcript,
    '',
    `Abrir lead: ${crmLink}`,
    `Responder al prospecto: ${prospectLink}`,
  ].join('\n').slice(0, 3900)

  try {
    const instance = process.env.EVOLUTION_INSTANCE || 'Invent'
    const response = await fetch(
      `https://ievoapi.inventagency.co/message/sendText/${encodeURIComponent(instance)}`,
      {
        method: 'POST',
        headers: { apikey: evolutionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: target, text: message }),
      },
    )
    if (!response.ok) {
      const details = (await response.text()).slice(0, 300)
      return { sent: false, error: `Evolution API ${response.status}: ${details}` }
    }

    const nextTags = Array.from(new Set([...currentTags, QUALIFICATION_NOTIFIED_TAG]))
    await supabase.from('leads').update({ tags: nextTags } as never).eq('id', lead.id)
    recordActivity(supabase, {
      lead_id: lead.id,
      activity_type: 'lead_status_change',
      title: 'Lead calificado — Sebastián notificado por WhatsApp',
      description: `Notificación enviada a +${target}`,
      metadata: { source, notification: 'whatsapp', target },
    })
    return { sent: true }
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : 'Error desconocido' }
  }
}
