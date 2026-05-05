import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

import { Users, Plus, Mail, Star } from 'lucide-react'
import Link from 'next/link'

async function getAgents() {
  const { data } = await supabase.from('agents').select('*').order('name')
  return data || []
}

async function getAgentStats(agentId: string) {
  const { data: tasks } = await supabase.from('agent_tasks').select('*').eq('agent_id', agentId)
  const total = tasks?.length || 0
  const completed = tasks?.filter((t: any) => t.status === 'completed').length || 0
  const inProgress = tasks?.filter((t: any) => t.status === 'in_progress').length || 0
  return { total, completed, inProgress }
}

export default async function AgentsPage() {
  const agents = await getAgents()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Agentes</h1>
          <p className="text-zinc-400 mt-1">Gestiona tu equipo de agentes</p>
        </div>
        <Button className="bg-white text-black hover:bg-zinc-200">
          <Plus className="h-4 w-4 mr-2" />Nuevo Agente
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Total Agentes</CardTitle>
            <Users className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{agents.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Activos</CardTitle>
            <Users className="h-4 w-4 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{agents.filter((a: any) => a.is_active).length}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Inactivos</CardTitle>
            <Users className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{agents.filter((a: any) => !a.is_active).length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent: any) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  )
}

async function AgentCard({ agent }: { agent: any }) {
  const stats = await getAgentStats(agent.id)

  return (
    <Card className="bg-zinc-950 border-zinc-800">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center text-xl text-white">
              {agent.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="font-semibold text-white">{agent.name}</h3>
              <p className="text-sm text-zinc-400">{agent.role || 'Agente'}</p>
            </div>
          </div>
          <Badge className={agent.is_active ? 'bg-green-500/20 text-green-400' : 'bg-zinc-500/20 text-zinc-400'}>
            {agent.is_active ? 'Activo' : 'Inactivo'}
          </Badge>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Mail className="h-4 w-4" />{agent.email}
          </div>
          {agent.hourly_rate && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Star className="h-4 w-4" />${agent.hourly_rate}/hora
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-zinc-800 grid grid-cols-3 gap-2 md:gap-4 text-center">
          <div><p className="text-lg font-semibold text-white">{stats.total}</p><p className="text-xs text-zinc-500">Tareas</p></div>
          <div><p className="text-lg font-semibold text-green-400">{stats.completed}</p><p className="text-xs text-zinc-500">Completadas</p></div>
          <div><p className="text-lg font-semibold text-yellow-400">{stats.inProgress}</p><p className="text-xs text-zinc-500">En Progreso</p></div>
        </div>

        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1 border-zinc-700 text-zinc-300" asChild>
            <Link href={`/dashboard/agents/${agent.id}`}>Ver Perfil</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
