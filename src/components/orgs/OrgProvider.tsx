'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

export type Workspace = {
  id: string
  name: string | null
  slug: string | null
  role: 'owner' | 'admin' | 'member'
}
type OrgContextValue = {
  activeOrgId: string | null
  activeOrg: Workspace | null
  orgs: Workspace[]
  connectedOrgIds: string[]
  loading: boolean
  switchOrg: (orgId: string) => Promise<void>
  refreshOrgs: () => Promise<void>
}

const OrgContext = createContext<OrgContextValue | null>(null)

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [orgs, setOrgs] = useState<Workspace[]>([])
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null)
  const [connectedOrgIds, setConnectedOrgIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const refreshOrgs = useCallback(async () => {
    setLoading(true)
    try {
      await fetch('/api/orgs/ensure', { method: 'POST' })
      const response = await fetch('/api/orgs/current', { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const json = await response.json()
      const availableOrgs = (json.orgs as Workspace[]) ?? []
      const savedOverride = window.sessionStorage.getItem('control:workspace-override')
      const validOverride = availableOrgs.find((org) => org.id === savedOverride)
      if (savedOverride && !validOverride) window.sessionStorage.removeItem('control:workspace-override')

      const hostname = window.location.hostname.toLowerCase()
      const preferredSlug = hostname === 'control.yumkgroup.com'
        ? 'yumk'
        : hostname === 'control.inventagency.co'
          ? 'invent'
          : null
      const preferredOrg = !validOverride
        ? availableOrgs.find((org) => org.slug === preferredSlug)
        : null
      const desiredOrg = validOverride ?? preferredOrg

      if (desiredOrg && desiredOrg.id !== json.active_org_id) {
        const switchResponse = await fetch('/api/orgs/switch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ org_id: desiredOrg.id }),
        })
        if (!switchResponse.ok) throw new Error('No se pudo abrir la marca asociada al dominio')
        window.location.reload()
        return
      }

      setOrgs(availableOrgs)
      setActiveOrgId(json.active_org_id ?? null)
      setConnectedOrgIds((json.connected_org_ids as string[]) ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshOrgs()
  }, [refreshOrgs])

  const switchOrg = useCallback(async (orgId: string) => {
    if (orgId === activeOrgId) return
    window.sessionStorage.setItem('control:workspace-override', orgId)
    const response = await fetch('/api/orgs/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId }),
    })
    if (!response.ok) {
      const json = await response.json().catch(() => ({}))
      throw new Error(json.error || 'No se pudo cambiar de workspace')
    }
    setActiveOrgId(orgId)
    // Server Components and client queries must both reload under the new org.
    window.location.assign('/dashboard')
    router.refresh()
  }, [activeOrgId, router])

  const value = useMemo<OrgContextValue>(() => ({
    activeOrgId,
    activeOrg: orgs.find((org) => org.id === activeOrgId) ?? null,
    orgs,
    connectedOrgIds,
    loading,
    switchOrg,
    refreshOrgs,
  }), [activeOrgId, connectedOrgIds, loading, orgs, refreshOrgs, switchOrg])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-sm text-zinc-500">
        Conectando la red comercial…
      </div>
    )
  }

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

export function useOrg() {
  const context = useContext(OrgContext)
  if (!context) throw new Error('useOrg must be used inside OrgProvider')
  return context
}
