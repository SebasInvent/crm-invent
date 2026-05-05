import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Reusable empty-state component for lists/tables/sections that have no data yet.
 * Use it instead of plain "No hay datos" strings — they kill product feel.
 *
 *   <EmptyState
 *     icon={Users}
 *     title="No tienes contactos"
 *     description="Agrega el primero o impórtalos desde un CSV."
 *     action={<Button>Nuevo contacto</Button>}
 *   />
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-6',
        className,
      )}
    >
      <div className="h-14 w-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
        <Icon className="h-7 w-7 text-zinc-500" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-white mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-zinc-500 max-w-md mb-5 leading-relaxed">
          {description}
        </p>
      )}
      {action}
    </div>
  )
}
