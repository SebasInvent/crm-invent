import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getServiceRoleClient } from '@/lib/supabase'
import { Timeline } from '@/components/timeline/Timeline'
import { Notes } from '@/components/notes/Notes'
import { ContactEditCard } from '@/components/edit/ContactEditCard'
import { ContactActionsBar } from '@/components/contacts/ContactActionsBar'
import {
  ContactConversation,
  type WaThread,
  type WaMessage,
} from '@/components/contacts/ContactConversation'
import { ArrowLeft, Mail, Phone, Building2, Star, TrendingUp, Briefcase } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export const dynamic = 'force-dynamic'

const TYPE_BADGES: Record<string, string> = {
  lead: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  prospect: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  customer: 'bg-green-500/20 text-green-400 border-green-500/30',
  partner: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  supplier: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
}

async function getContact(id: string) {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('contacts_with_organization')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return data as any
}

/**
 * Carga el hilo de WhatsApp del contacto (matchea por los últimos 10 dígitos
 * del teléfono para tolerar el prefijo país 57 y formatos con espacios).
 * Los nuevos mensajes llegan luego por Realtime en el cliente.
 */
async function getWhatsappConversation(phone: string | null) {
  const empty = { thread: null as WaThread, messages: [] as WaMessage[] }
  if (!phone) return empty
  const digits = phone.replace(/\D/g, '')
  const match = digits.length >= 10 ? digits.slice(-10) : digits
  if (!match) return empty

  const supabase = getServiceRoleClient()
  const [threadsRes, messagesRes] = await Promise.all([
    supabase
      .from('chat_threads' as never)
      .select('*')
      .like('phone' as never, `%${match}`)
      .order('last_message_at' as never, { ascending: false })
      .limit(1),
    supabase
      .from('chat_messages' as never)
      .select('*')
      .like('phone' as never, `%${match}`)
      .order('created_at' as never, { ascending: true })
      .limit(500),
  ])

  const threads = (threadsRes.data as any[]) || []
  const messages = (messagesRes.data as any[]) || []
  return {
    thread: (threads[0] ?? null) as WaThread,
    messages: messages as WaMessage[],
  }
}

export default async function ContactDetailPage({ params }: { params: { id: string } }) {
  const contact = await getContact(params.id)
  if (!contact) notFound()

  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim()
  const whatsappPhone = contact.phone || contact.mobile || null
  const { thread, messages } = await getWhatsappConversation(whatsappPhone)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/dashboard/contacts">
          <Button variant="ghost" size="icon" className="h-9 w-9 text-zinc-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white truncate">{fullName || '(sin nombre)'}</h1>
          <p className="text-sm text-zinc-500">
            {contact.company_name || 'Sin empresa'} · creado{' '}
            {contact.created_at &&
              format(new Date(contact.created_at), "d 'de' MMM yyyy", { locale: es })}
          </p>
        </div>
        {contact.type && (
          <Badge variant="outline" className={TYPE_BADGES[contact.type] || TYPE_BADGES.lead}>
            {contact.type}
          </Badge>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        {/* Sidebar info */}
        <div className="space-y-4">
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-zinc-400">Contacto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
                  className="flex items-center gap-2 text-zinc-300 hover:text-white"
                >
                  <Mail className="h-3.5 w-3.5 text-zinc-500" />
                  <span className="truncate">{contact.email}</span>
                </a>
              )}
              {whatsappPhone && (
                <a
                  href={`tel:${whatsappPhone}`}
                  className="flex items-center gap-2 text-zinc-300 hover:text-white"
                >
                  <Phone className="h-3.5 w-3.5 text-zinc-500" />
                  <span>{whatsappPhone}</span>
                </a>
              )}
              {contact.company_name && (
                <div className="flex items-center gap-2 text-zinc-300">
                  <Building2 className="h-3.5 w-3.5 text-zinc-500" />
                  <span className="truncate">{contact.company_name}</span>
                </div>
              )}
              {contact.job_title && (
                <div className="flex items-center gap-2 text-zinc-300">
                  <Briefcase className="h-3.5 w-3.5 text-zinc-500" />
                  <span className="truncate">{contact.job_title}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {(contact.lead_score != null || contact.lifetime_value != null) && (
            <Card className="bg-zinc-950 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Métricas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {contact.lead_score != null && (
                  <div>
                    <div className="flex items-center justify-between text-zinc-400">
                      <span className="flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 text-yellow-500" />
                        Lead score
                      </span>
                      <span className="font-medium text-white">{contact.lead_score}</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-white"
                        style={{
                          width: `${Math.min(100, Math.max(0, contact.lead_score))}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
                {contact.lifetime_value != null && (
                  <div className="flex items-center justify-between text-zinc-400">
                    <span>LTV</span>
                    <span className="font-medium text-white">
                      ${(contact.lifetime_value || 0).toLocaleString()}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <ContactEditCard
            contactId={params.id}
            initial={{
              first_name: contact.first_name,
              last_name: contact.last_name,
              email: contact.email,
              phone: contact.phone,
              mobile: contact.mobile,
              job_title: contact.job_title,
              company_name: contact.company_name,
              industry: contact.industry,
              type: contact.type,
              status: contact.status,
              priority: contact.priority,
              city: contact.city,
              country: contact.country,
              website: contact.website,
              linkedin_url: contact.linkedin_url,
            }}
          />

          {contact.tags && contact.tags.length > 0 && (
            <Card className="bg-zinc-950 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-zinc-400">Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {contact.tags.map((tag: string) => (
                    <span
                      key={tag}
                      className="text-xs bg-zinc-900 border border-zinc-800 text-zinc-400 rounded px-2 py-0.5"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: Actions + Notes + Timeline */}
        <div className="space-y-6 min-w-0">
          <ContactActionsBar
            contactId={params.id}
            contactLabel={fullName || contact.email || 'contacto'}
            contactEmail={contact.email}
          />

          <section>
            <h2 className="text-sm font-medium text-zinc-400 mb-4 uppercase tracking-wider">
              WhatsApp
            </h2>
            <ContactConversation
              contactPhone={whatsappPhone}
              contactName={fullName}
              initialThread={thread}
              initialMessages={messages}
            />
          </section>

          <section>
            <h2 className="text-sm font-medium text-zinc-400 mb-4 uppercase tracking-wider">
              Notas
            </h2>
            <Notes contactId={params.id} />
          </section>

          <section>
            <h2 className="text-sm font-medium text-zinc-400 mb-4 uppercase tracking-wider">
              Actividad
            </h2>
            <Timeline contactId={params.id} />
          </section>
        </div>
      </div>
    </div>
  )
}
