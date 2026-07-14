import Link from 'next/link'
import { ClientDetailActions } from '@/components/clients/ClientDetailActions'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

import { ArrowLeft, Mail, Phone, Building2 } from 'lucide-react'
import type { Client, Project, Conversation } from '@/types/database'

async function getClient(id: string): Promise<Client | null> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    return null
  }

  return data as Client
}

async function getClientProjects(clientId: string) {
  const { data } = await supabase
    .from('projects')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  return data || []
}

async function getClientConversations(clientId: string) {
  const { data } = await supabase
    .from('conversations')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(10)

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

export default async function ClientDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const client = await getClient(params.id)

  if (!client) {
    notFound()
  }

  const projects = await getClientProjects(params.id)
  const conversations = await getClientConversations(params.id)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/clients">
            <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-white">{client.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className={getStatusBadge(client.status)}>
                {client.status}
              </Badge>
            </div>
          </div>
        </div>
        <ClientDetailActions
          client={{
            id: client.id,
            name: client.name,
            email: client.email,
            phone: client.phone,
            company: client.company,
            status: client.status,
          }}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="bg-zinc-950 border-zinc-800 md:col-span-2">
          <CardHeader>
            <CardTitle className="text-white">Información de Contacto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-zinc-400" />
              <span className="text-white">{client.email}</span>
            </div>
            {client.phone && (
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-zinc-400" />
                <span className="text-white">{client.phone}</span>
              </div>
            )}
            {client.company && (
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-zinc-400" />
                <span className="text-white">{client.company}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">Resumen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-zinc-500">Lifetime Value</p>
              <p className="text-2xl font-bold text-white">
                ${client.lifetime_value?.toLocaleString() || '0'}
              </p>
            </div>
            <div>
              <p className="text-sm text-zinc-500">Proyectos Activos</p>
              <p className="text-2xl font-bold text-white">
                {projects.filter((p: any) => p.status !== 'completed' && p.status !== 'cancelled').length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="projects" className="w-full">
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="projects" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white">
            Proyectos
          </TabsTrigger>
          <TabsTrigger value="conversations" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white">
            Conversaciones
          </TabsTrigger>
        </TabsList>

        <TabsContent value="projects" className="mt-6">
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">Proyectos</CardTitle>
            </CardHeader>
            <CardContent>
              {projects.length === 0 ? (
                <p className="text-zinc-500">No hay proyectos registrados</p>
              ) : (
                <div className="space-y-4">
                  {projects.map((project: any) => (
                    <Link
                      key={project.id}
                      href={`/dashboard/projects/${project.id}`}
                      className="block p-4 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-white">{project.name}</h3>
                          <p className="text-sm text-zinc-400">{project.status}</p>
                        </div>
                        <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                          {project.progress}%
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conversations" className="mt-6">
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">Conversaciones</CardTitle>
            </CardHeader>
            <CardContent>
              {conversations.length === 0 ? (
                <p className="text-zinc-500">No hay conversaciones registradas</p>
              ) : (
                <div className="space-y-4">
                  {conversations.map((conv: any) => (
                    <div key={conv.id} className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/50">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary" className="bg-zinc-800 text-zinc-300">
                          {conv.channel}
                        </Badge>
                        <span className="text-xs text-zinc-500">
                          {new Date(conv.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-white">{conv.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
