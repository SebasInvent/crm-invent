import { EmptyState } from '@/components/ui/empty-state'
import { Calendar } from 'lucide-react'

export default function CalendarPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Calendario</h1>
        <p className="text-zinc-400 mt-1">Reuniones, follow-ups y eventos</p>
      </div>

      <div className="border border-zinc-800 rounded-lg bg-zinc-950">
        <EmptyState
          icon={Calendar}
          title="Próximamente"
          description="Vamos a integrar Google Calendar para que veas tus reuniones, follow-ups de leads y entregables en una sola línea de tiempo. Mientras tanto, los follow-ups viven en cada lead."
        />
      </div>
    </div>
  )
}
