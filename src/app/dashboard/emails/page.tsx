import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

import { Send, Mail } from 'lucide-react'

async function getEmailLogs() {
  const { data, error } = await supabase
    .from('email_logs')
    .select('*, clients(name)')
    .order('sent_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('Error fetching email logs:', error)
    return []
  }

  return data || []
}

export default async function EmailsPage() {
  const emailLogs = await getEmailLogs()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Emails</h1>
          <p className="text-zinc-400 mt-1">Envía emails y revisa el historial</p>
        </div>
        <Button className="bg-white text-black hover:bg-zinc-200">
          <Send className="h-4 w-4 mr-2" />
          Nuevo Email
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">Enviar Email</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm text-zinc-400 block mb-2">Para</label>
              <Input
                placeholder="cliente@ejemplo.com"
                className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 block mb-2">Asunto</label>
              <Input
                placeholder="Asunto del email"
                className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 block mb-2">Mensaje</label>
              <textarea
                rows={6}
                placeholder="Escribe tu mensaje..."
                className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-white placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-700"
              />
            </div>
            <Button className="w-full bg-white text-black hover:bg-zinc-200">
              <Send className="h-4 w-4 mr-2" />
              Enviar Email
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Historial de Emails
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {emailLogs.length === 0 ? (
                <p className="text-zinc-500 text-center py-8">No hay emails enviados</p>
              ) : (
                emailLogs.map((log: any) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white font-medium">{log.to_email}</span>
                      <span className="text-xs text-zinc-500">
                        {new Date(log.sent_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-400 mt-1">{log.subject}</p>
                    {log.clients?.name && (
                      <p className="text-xs text-zinc-600 mt-1">{log.clients.name}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
