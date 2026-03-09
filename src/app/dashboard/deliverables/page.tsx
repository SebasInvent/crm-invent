import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

import { CheckCircle, Clock, Send, FileCheck, Loader2 } from 'lucide-react'
import Link from 'next/link'

async function getAllDeliverables() {
  const { data } = await supabase
    .from('agent_deliverables')
    .select(`
      *,
      agents(name),
      clients(name),
      projects(name)
    `)
    .order('created_at', { ascending: false })

  return data || []
}

export default async function DeliverablesPage() {
  const allDeliverables = await getAllDeliverables()
  
  const assigned = allDeliverables.filter((d: any) => !d.approved_for_send && !d.sent_to_client)
  const approved = allDeliverables.filter((d: any) => d.approved_for_send && !d.sent_to_client)
  const sent = allDeliverables.filter((d: any) => d.sent_to_client)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Pipeline de Entregables</h1>
          <p className="text-zinc-400 mt-1">Gestiona el flujo de trabajo de entregables</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Por Aprobar</CardTitle>
            <Clock className="h-4 w-4 text-yellow-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{assigned.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Aprobados</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{approved.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Enviados</CardTitle>
            <Send className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{sent.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Total</CardTitle>
            <FileCheck className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{allDeliverables.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <KanbanColumn title="Por Aprobar" deliverables={assigned} icon={<Clock className="h-5 w-5 text-yellow-400" />} />
        <KanbanColumn title="Aprobados" deliverables={approved} icon={<CheckCircle className="h-5 w-5 text-green-400" />} />
        <KanbanColumn title="Enviados" deliverables={sent} icon={<Send className="h-5 w-5 text-blue-400" />} />
      </div>
    </div>
  )
}

function KanbanColumn({ title, deliverables, icon }: { title: string, deliverables: any[], icon: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
        {icon}
        <h3 className="font-semibold text-white">{title}</h3>
        <Badge variant="secondary" className="bg-zinc-800 text-zinc-300 ml-auto">{deliverables.length}</Badge>
      </div>
      <div className="space-y-3">
        {deliverables.map((deliverable: any) => (
          <Card key={deliverable.id} className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4 space-y-3">
              <h4 className="font-medium text-white">{deliverable.title}</h4>
              <p className="text-sm text-zinc-400">{deliverable.description}</p>
              <div className="text-xs text-zinc-500">
                Agente: {deliverable.agents?.name || 'No asignado'}
              </div>
              {!deliverable.approved_for_send && (
                <Button variant="outline" className="w-full border-zinc-700 text-zinc-300" size="sm" asChild>
                  <Link href={`/dashboard/deliverables/${deliverable.id}`}>Revisar</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
