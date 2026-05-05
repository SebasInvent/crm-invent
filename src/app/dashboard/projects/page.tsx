import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

import { Plus, Search, FolderKanban } from 'lucide-react'

async function getProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('*, clients(name)')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching projects:', error)
    return []
  }

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

export default async function ProjectsPage() {
  const projects = await getProjects()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Proyectos</h1>
          <p className="text-zinc-400 mt-1">Gestiona tus proyectos activos</p>
        </div>
        <Button
          disabled
          className="bg-white text-black hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Próximamente — proyectos derivados de deals cerrados"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Proyecto
        </Button>
      </div>

      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Buscar proyectos..."
                className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {projects.length === 0 ? (
              <div className="text-center py-12">
                <FolderKanban className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
                <p className="text-zinc-500">No hay proyectos registrados</p>
                <p className="text-zinc-600 text-sm mt-1">
                  Comienza creando tu primer proyecto
                </p>
              </div>
            ) : (
              projects.map((project: any) => (
                <Link
                  key={project.id}
                  href={`/dashboard/projects/${project.id}`}
                  className="block p-4 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white">{project.name}</h3>
                        <Badge variant="outline" className={getStatusBadge(project.status)}>
                          {project.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-zinc-400">{project.clients?.name}</p>
                      {project.description && (
                        <p className="text-sm text-zinc-500 line-clamp-2">{project.description}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-zinc-500">Progreso</p>
                      <p className="font-semibold text-white">{project.progress}%</p>
                    </div>
                  </div>
                  {project.budget && (
                    <div className="mt-3 pt-3 border-t border-zinc-800">
                      <p className="text-sm text-zinc-500">
                        Presupuesto: <span className="text-white">${project.budget.toLocaleString()}</span>
                      </p>
                    </div>
                  )}
                </Link>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
