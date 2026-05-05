'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Error boundary for the entire /dashboard segment.
 * Renders when any nested route throws during render or in a server component.
 *
 * Reset re-tries the segment without a full page reload.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // TODO: ship this to Sentry/LogRocket once we wire that in P3
    console.error('[dashboard error boundary]', error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-zinc-950 border border-zinc-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-red-500/15 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Algo salió mal</h2>
            <p className="text-sm text-zinc-400">
              No pudimos cargar esta sección.
            </p>
          </div>
        </div>

        <div className="rounded-md bg-zinc-900/60 border border-zinc-800 p-3 text-xs font-mono text-zinc-400 break-words">
          {error.message || 'Error desconocido'}
          {error.digest && (
            <p className="mt-2 text-zinc-600">ID: {error.digest}</p>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            onClick={reset}
            className="bg-white text-black hover:bg-zinc-200"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reintentar
          </Button>
          <Button
            variant="outline"
            onClick={() => (window.location.href = '/dashboard')}
            className="border-zinc-800"
          >
            Volver al inicio
          </Button>
        </div>
      </div>
    </div>
  )
}
