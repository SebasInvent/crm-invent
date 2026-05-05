import Link from 'next/link'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { getServiceRoleClient } from '@/lib/supabase'
import { NewClientDialog } from '@/components/clients/NewClientDialog'

export const dynamic = 'force-dynamic'

import { Search, Mail, Phone, Building2 } from 'lucide-react'

async function getClients() {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching clients:', error)
    return []
  }

  return data || []
}

function getStatusBadge(status: string) {
  const variants: Record<string, string> = {
    active: 'bg-green-500/20 text-green-400 border-green-500/30',
    inactive: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
    lead: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  }
  return variants[status] || variants.inactive
}

function getPriorityBadge(priority: string) {
  const variants: Record<string, string> = {
    high: 'bg-red-500/20 text-red-400 border-red-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    low: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  }
  return variants[priority] || variants.low
}

export default async function ClientsPage() {
  const clients = await getClients()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-white">Clientes</h1>
          <p className="text-zinc-400 mt-1">Gestiona tus clientes y leads</p>
        </div>
        <NewClientDialog />
      </div>

      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Buscar clientes..."
                className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {clients.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-zinc-500">No hay clientes registrados</p>
                <p className="text-zinc-600 text-sm mt-1">
                  Comienza agregando tu primer cliente
                </p>
              </div>
            ) : (
              clients.map((client: any) => (
                <Link
                  key={client.id}
                  href={`/dashboard/clients/${client.id}`}
                  className="block p-4 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white">{client.name}</h3>
                        <Badge
                          variant="outline"
                          className={getStatusBadge(client.status)}
                        >
                          {client.status}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={getPriorityBadge(client.priority)}
                        >
                          {client.priority}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-zinc-400">
                        {client.company && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {client.company}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {client.email}
                        </span>
                        {client.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {client.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-zinc-500">Lifetime Value</p>
                      <p className="font-semibold text-white">
                        ${client.lifetime_value?.toLocaleString() || '0'}
                      </p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
