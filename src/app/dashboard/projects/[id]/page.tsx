import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

import { ArrowLeft, FolderKanban, Edit, Trash2 } from 'lucide-react'
import type { Project, Task, Deliverable } from '@/types/database'

async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*, clients(name)')
    .eq('id', id)
    .single()

  if (error || !data) {
    return null
  }

  return data as Project
}

async function getProjectTasks(projectId: string) {
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  return data || []
}

async function getProjectDeliverables(projectId: string) {
  const { data } = await supabase
    .from('deliverables')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  return data || []
}

function getStatusBadge(status: string) {
  const variants: Record<string, string> = {
    planning: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    in_progress: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    review: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    completed: 'bg-green-500/20 text-green-400 border-green-500/30',
    cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
  }
  return variants[status] || variants.planning
}

export default async function ProjectDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const project = await getProject(params.id)

  if (!project) {
    notFound()
  }

  const tasks = await getProjectTasks(params.id)
  const deliverables = await getProjectDeliverables(params.id)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/projects">
            <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-white">{project.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className={getStatusBadge(project.status)}>
                {project.status}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
            <Edit className="h-4 w-4 mr-2" />
            Editar
          </Button>
          <Button variant="destructive" className="bg-red-600 hover:bg-red-700">
            <Trash2 className="h-4 w-4 mr-2" />
            Eliminar
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="bg-zinc-950 border-zinc-800 md:col-span-2">
          <CardHeader>
            <CardTitle className="text-white">Información del Proyecto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {project.description && (
              <p className="text-zinc-300">{project.description}</p>
            )}
            <div className="flex items-center gap-3">
              <FolderKanban className="h-5 w-5 text-zinc-400" />
              <span className="text-white">Progreso: {project.progress}%</span>
            </div>
            {project.budget && (
              <p className="text-zinc-400">Presupuesto: <span className="text-white">${project.budget.toLocaleString()}</span></p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">Resumen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-zinc-500">Tareas</p>
              <p className="text-2xl font-bold text-white">{tasks.length}</p>
            </div>
            <div>
              <p className="text-sm text-zinc-500">Entregables</p>
              <p className="text-2xl font-bold text-white">{deliverables.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="tasks" className="w-full">
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="tasks" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white">
            Tareas
          </TabsTrigger>
          <TabsTrigger value="deliverables" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white">
            Entregables
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-6">
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">Tareas</CardTitle>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="text-zinc-500">No hay tareas registradas</p>
              ) : (
                <div className="space-y-4">
                  {tasks.map((task: any) => (
                    <div key={task.id} className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/50">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-white">{task.title}</h3>
                          <p className="text-sm text-zinc-400">{task.status}</p>
                        </div>
                        <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                          {task.priority}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deliverables" className="mt-6">
          <Card className="bg-zinc-950 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">Entregables</CardTitle>
            </CardHeader>
            <CardContent>
              {deliverables.length === 0 ? (
                <p className="text-zinc-500">No hay entregables registrados</p>
              ) : (
                <div className="space-y-4">
                  {deliverables.map((del: any) => (
                    <div key={del.id} className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/50">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-white">{del.name}</h3>
                          <p className="text-sm text-zinc-400">{del.status}</p>
                        </div>
                        {del.due_date && (
                          <span className="text-xs text-zinc-500">
                            {new Date(del.due_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
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
