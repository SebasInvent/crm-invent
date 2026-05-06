import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getServiceRoleClient } from '@/lib/supabase'
import { EmptyState } from '@/components/ui/empty-state'
import { EmailsHeader } from '@/components/emails/EmailsHeader'
import { Mail, CheckCircle2, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export const dynamic = 'force-dynamic'

async function getEmailLogs() {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('email_logs')
    .select('id, to_email, subject, status, sent_at, from_email, clients(name)')
    .order('sent_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('email_logs query failed:', error.message)
    return []
  }
  return (data ?? []) as Array<{
    id: string
    to_email: string
    subject: string
    status: string | null
    sent_at: string | null
    from_email: string | null
    clients: { name: string } | null
  }>
}

export default async function EmailsPage() {
  const logs = await getEmailLogs()

  const sent = logs.filter((l) => l.status === 'sent').length
  const failed = logs.filter((l) => l.status === 'failed').length

  return (
    <div className="space-y-6">
      {/* Header has the "Nuevo Email" button → opens composer dialog */}
      <EmailsHeader />

      {/* Quick stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-sm text-zinc-400">
              <span className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Total enviados
              </span>
            </div>
            <p className="text-2xl font-bold text-white mt-1">{logs.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-sm text-zinc-400">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Exitosos
              </span>
            </div>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{sent}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-sm text-zinc-400">
              <span className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-400" />
                Fallidos
              </span>
            </div>
            <p className="text-2xl font-bold text-red-400 mt-1">{failed}</p>
          </CardContent>
        </Card>
      </div>

      {/* History */}
      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base text-white flex items-center gap-2">
            <Mail className="h-4 w-4 text-zinc-400" />
            Historial reciente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="Aún no hay emails"
              description="Cuando envíes uno desde el botón Nuevo Email o desde la ficha de un contacto, aparecerá aquí con su estado."
            />
          ) : (
            <ol className="divide-y divide-zinc-800">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="py-2.5 px-1 flex items-start justify-between gap-3 hover:bg-zinc-900/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white truncate">{log.subject}</span>
                      <StatusDot status={log.status} />
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5 truncate">
                      Para: {log.to_email}
                      {log.clients?.name ? ` · ${log.clients.name}` : ''}
                    </div>
                  </div>
                  <span className="text-xs text-zinc-500 flex-shrink-0">
                    {log.sent_at
                      ? format(new Date(log.sent_at), "d MMM, HH:mm", { locale: es })
                      : '—'}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatusDot({ status }: { status: string | null }) {
  if (status === 'sent') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Enviado
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-red-400">
        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
        Fallido
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
      {status ?? 'pendiente'}
    </span>
  )
}
