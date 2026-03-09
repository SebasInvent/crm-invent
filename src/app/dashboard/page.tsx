import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

import { Users, FolderKanban, DollarSign, CheckSquare, Calendar } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Client, Project, Invoice, Task, Meeting, Conversation } from '@/types/database'

async function getDashboardStats() {
  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .eq('status', 'active')

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .in('status', ['planning', 'in_progress', 'review'])

  const { data: invoices } = await supabase
    .from('invoices')
    .select('total_amount')
    .eq('status', 'paid')
    .gte('issue_date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .in('status', ['todo', 'in_progress'])

  // Agent stats
  const { data: agents } = await supabase
    .from('agents')
    .select('*')
    .eq('is_active', true)

  const { data: agentTasks } = await supabase
    .from('agent_tasks')
    .select('*')
    .in('status', ['assigned', 'in_progress'])

  // Deliverable stats
  const { data: deliverablesPending } = await supabase
    .from('agent_deliverables')
    .select('*')
    .eq('approved_for_send', false)
    .eq('sent_to_client', false)

  const monthlyRevenue = (invoices as Invoice[] | null)?.reduce((sum, inv) => sum + (inv.total_amount || 0), 0) || 0

  return {
    activeClients: clients?.length || 0,
    activeProjects: projects?.length || 0,
    monthlyRevenue,
    pendingTasks: tasks?.length || 0,
    activeAgents: agents?.length || 0,
    pendingAgentTasks: agentTasks?.length || 0,
    deliverablesPending: deliverablesPending?.length || 0,
  }
}

async function getUpcomingMeetings() {
  const { data } = await supabase
    .from('meetings')
    .select('*, clients(name)')
    .eq('status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(5)

  return data || []
}

async function getRecentActivity() {
  const { data: conversations } = await supabase
    .from('conversations')
    .select('*, clients(name)')
    .order('created_at', { ascending: false })
    .limit(5)

  return conversations || []
}

export default async function DashboardPage() {
  const stats = await getDashboardStats()
  const meetings = await getUpcomingMeetings()
  const activities = await getRecentActivity()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-zinc-400 mt-1">Bienvenido a Invent CRM</p>
      </div>

      {/* KPI Cards - Row 1 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Clientes Activos
            </CardTitle>
            <Users className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.activeClients}</div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Proyectos en Curso
            </CardTitle>
            <FolderKanban className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.activeProjects}</div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Ingresos del Mes
            </CardTitle>
            <DollarSign className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              ${stats.monthlyRevenue.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Tareas Pendientes
            </CardTitle>
            <CheckSquare className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.pendingTasks}</div>
          </CardContent>
        </Card>
      </div>

      {/* KPI Cards - Row 2: Agents & Deliverables */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Agentes Activos
            </CardTitle>
            <Users className="h-4 w-4 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.activeAgents}</div>
            <p className="text-xs text-zinc-500 mt-1">
              {stats.pendingAgentTasks} tareas por hacer
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Entregables por Aprobar
            </CardTitle>
            <CheckSquare className="h-4 w-4 text-yellow-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.deliverablesPending}</div>
            <p className="text-xs text-zinc-500 mt-1">
              Requieren revisión
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              Pipeline Activo
            </CardTitle>
            <FolderKanban className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {stats.pendingAgentTasks + stats.deliverablesPending}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Tareas + Entregables
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Meetings & Recent Activity */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Próximas Reuniones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {meetings.length === 0 ? (
                <p className="text-zinc-500">No hay reuniones programadas</p>
              ) : (
                meetings.map((meeting: any) => (
                  <div key={meeting.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">{meeting.title}</p>
                      <p className="text-sm text-zinc-400">{meeting.clients?.name}</p>
                    </div>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                      {format(new Date(meeting.scheduled_at), 'dd MMM HH:mm', { locale: es })}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">Actividad Reciente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activities.length === 0 ? (
                <p className="text-zinc-500">No hay actividad reciente</p>
              ) : (
                activities.map((activity: any) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <Badge variant="secondary" className="bg-zinc-800 text-zinc-300">
                      {activity.channel}
                    </Badge>
                    <div className="flex-1">
                      <p className="text-sm text-white">{activity.message}</p>
                      <p className="text-xs text-zinc-500">{activity.clients?.name}</p>
                    </div>
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
