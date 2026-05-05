import { getServiceRoleClient } from '@/lib/supabase'
import ConversationsView from './conversations-view'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function ConversacionesPage() {
  const supabase = getServiceRoleClient()

  // Cargar threads iniciales (los demás llegan por realtime)
  const { data: threads } = await supabase
    .from('chat_threads' as never)
    .select('*')
    .order('last_message_at' as never, { ascending: false })
    .limit(100)

  return <ConversationsView initialThreads={(threads as never[]) || []} />
}
