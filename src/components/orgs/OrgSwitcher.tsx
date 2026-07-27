'use client'

import { Building2, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { useOrg } from './OrgProvider'

export function OrgSwitcher() {
  const { activeOrgId, activeOrg, orgs, connectedOrgIds, loading, switchOrg } = useOrg()

  if (loading) {
    return <div className="mx-3 mt-3 h-12 rounded-lg bg-zinc-900 animate-pulse" />
  }

  if (!activeOrg) return null

  return (
    <label className="relative mx-3 mb-5 mt-3 block">
      <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-600">Marca activa</span>
      <Building2 className="absolute left-3 top-[38px] h-4 w-4 -translate-y-1/2 text-zinc-500 pointer-events-none" />
      <select
        value={activeOrgId ?? ''}
        onChange={(event) => {
          void switchOrg(event.target.value).catch((error) => {
            toast.error(error instanceof Error ? error.message : 'No se pudo cambiar de workspace')
          })
        }}
        className="h-12 w-full appearance-none rounded-lg border border-zinc-800 bg-zinc-950 pl-9 pr-8 text-sm font-medium text-white outline-none transition-colors hover:border-zinc-700 focus:border-zinc-600"
      >
        {orgs.map((org) => (
          <option key={org.id} value={org.id}>{org.name ?? org.slug ?? 'Workspace'}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-[38px] h-4 w-4 -translate-y-1/2 text-zinc-500 pointer-events-none" />
      <span className="absolute -bottom-5 left-1 text-[9px] tracking-[0.08em] text-zinc-600">
        {connectedOrgIds.length > 0 ? 'Clientes y actividad compartidos' : activeOrg.role}
      </span>
    </label>
  )
}
