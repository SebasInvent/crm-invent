import { redirect } from 'next/navigation'
import { getApiSession } from '@/lib/api-auth'
import { SettingsClient } from '@/components/settings/SettingsClient'

export const dynamic = 'force-dynamic'

/**
 * /dashboard/settings
 *
 * Server component: pulls the session on the server and forwards safe
 * fields to the client. Anything sensitive (password, recovery tokens)
 * stays out — only user-visible profile fields get sent across.
 */
export default async function SettingsPage() {
  const session = await getApiSession()
  if (!session) redirect('/login')

  const user = session.user
  return (
    <SettingsClient
      email={user.email ?? '—'}
      userId={user.id}
      createdAt={user.created_at}
      lastSignInAt={user.last_sign_in_at ?? null}
      provider={user.app_metadata?.provider ?? 'email'}
    />
  )
}
