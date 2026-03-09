import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

let supabaseInstance: ReturnType<typeof createClient<Database>> | null = null
let serviceRoleClient: ReturnType<typeof createClient<Database>> | null = null

function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not defined')
  }
  return url
}

function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not defined')
  }
  return key
}

function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not defined')
  }
  return key
}

// Lazy initialization - solo se crea cuando se usa
export const supabase = new Proxy({} as ReturnType<typeof createClient<Database>>, {
  get(target, prop) {
    if (!supabaseInstance) {
      supabaseInstance = createClient<Database>(getSupabaseUrl(), getSupabaseAnonKey())
    }
    return supabaseInstance[prop as keyof typeof supabaseInstance]
  }
})

export const getServiceRoleClient = () => {
  if (!serviceRoleClient) {
    serviceRoleClient = createClient<Database>(getSupabaseUrl(), getServiceRoleKey())
  }
  return serviceRoleClient
}
