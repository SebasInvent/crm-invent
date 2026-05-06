import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getServiceRoleClient } from '@/lib/supabase'
import { EmptyState } from '@/components/ui/empty-state'
import {
  ArrowLeft,
  Mail,
  Shield,
  CheckCircle,
  Clock,
  Loader2,
  ListTodo,
  Activity,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export const dynamic = 'force-dynamic'

const ROLE_BADGES: Record<string, string> = {
  admin: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  manager: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  agent: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  viewer: 'bg-zinc-700/30 text-zinc-500 border-zinc-700',
}

const STATUS_DOT: Record<string, string> = {
  active: 'bg-emerald-500',
  inactive: 'bg-zinc-600',
  away: 'bg-amber-500',
}

async function getAgent(id: string) {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('agents')
    .select('id, name, email, avatar_url, role, status, created_at')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return data as {
    id: string
    name: string
    email: string
    avatar_url: string | null
    role: string
    status: string
    created_at: string
  }
}

async function getAgentTasks(agentId: string) {
  const supabase = getServiceRoleClient()
  const { data } = await supabase
    .from('agent_tasks')
    .select('id, title, description, status, priority, due_date, created_at')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(50)
  return (data || []) as Array<{
    id: string
    title: string
    description: string | null
    status: string
    priority: string | null
    due_date: string | null
    created_at: string
  }>
}

const TASK_STATUS_BADGES: Record<string, { label: string; className: string }> = {
  todo: { label: 'Pendiente', className: 'bg-zinc-700/40 text-zinc-300' },
  in_progress: { label: 'En curso', className: 'bg-sky-500/20 text-sky-400' },
  review: { label: 'Revisión', className: 'bg-amber-500/20 text-amber-400' },
  done: { label: 'Completada', className: 'bg-emerald-500/20 text-emerald-400' },
  completed: { label: 'Completada', className: 'bg-emerald-500/20 text-emerald-400' },
}

export default async function AgentDetailPage({ params }: { params: { id: string } }) {
  const agent = await getAgent(params.id)
  if (!agent) notFound()

  const tasks = await getAgentTasks(params.id)
  const completed = tasks.filter((t) => t.status === 'done' || t.status === 'completed').length
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length
  const pending = tasks.filter((t) => t.status === 'todo').length

  const initials = agent.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/dashboard/agents">
          <Button variant="ghost" size="icon" className="h-9 w-9 text-zinc-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {agent.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={agent.avatar_url}
              alt={agent.name}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-sm font-medium text-zinc-300">
              {initials || '?'}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-white truncate flex items-center gap-2">
              {agent.name}
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  STATUS_DOT[agent.status] ?? STATUS_DOT.inactive
                }`}
                title={agent.status}
              />
            </h1>
            <p className="text-sm text-zinc-500">
              {agent.email} · creado{' '}
              {format(new Date(agent.created_at), "d 'de' MMM yyyy", { locale: es })}
            </p>
          </div>
        </div>
        <Badge variant="outline" className={ROLE_BADGES[agent.role] ?? ROLE_BADGES.agent}>
          <Shield className="h-3 w-3 mr-1" />
          {agent.role}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-zinc-400">Contacto</CardTitle>
            </CardHeader>
            <CardContent>
              <a
                href={`mailto:${agent.email}`}
                className="flex items-center gap-2 text-sm text-zinc-300 hover:text-white"
              >
                <Mail className="h-3.5 w-3.5 text-zinc-500" />
                <span className="truncate">{agent.email}</span>
              </a>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Estadísticas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Stat icon={ListTodo} label="Total tareas" value={tasks.length} color="text-zinc-300" />
              <Stat icon={CheckCircle} label="Completadas" value={completed} color="text-emerald-400" />
              <Stat icon={Loader2} label="En curso" value={inProgress} color="text-sky-400" />
              <Stat icon={Clock} label="Pendientes" value={pending} color="text-amber-400" />
            </CardContent>
          </Card>
        </div>

        {/* Main: tasks list */}
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-zinc-400 mb-4 uppercase tracking-wider">
            Tareas asignadas
          </h2>

          {tasks.length === 0 ? (
            <EmptyState
              icon={ListTodo}
              title="Sin tareas asignadas"
              description="Cuando crees una tarea y se la asignes a este agente, aparecerá aquí."
            />
          ) : (
            <ol className="space-y-2">
              {tasks.map((t) => {
                const sb = TASK_STATUS_BADGES[t.status] ?? TASK_STATUS_BADGES.todo
                return (
                  <li
                    key={t.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 hover:bg-zinc-900/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-white text-sm truncate">{t.title}</div>
                        {t.description && (
                          <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{t.description}</p>
                        )}
                      </div>
                      <Badge variant="outline" className={sb.className}>
                        {sb.label}
                      </Badge>
                    </div>
                    {(t.priority || t.due_date) && (
                      <div className="flex items-center gap-3 text-xs text-zinc-500 mt-2">
                        {t.priority && (
                          <span className="capitalize">prioridad: {t.priority}</span>
                        )}
                        {t.due_date && (
                          <span>
                            vence:{' '}
                            {format(new Date(t.due_date), "d 'de' MMM yyyy", { locale: es })}
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Activity
  label: string
  value: number
  color: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-zinc-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className={`font-medium ${color}`}>{value}</span>
    </div>
  )
}
