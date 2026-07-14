'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import {
  useSupabaseQuery,
  useSupabaseMutation,
  queryKeys,
} from '@/lib/hooks/useSupabaseQuery'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { format, isToday, isYesterday } from 'date-fns'
import { es } from 'date-fns/locale'
import { EmptyState } from '@/components/ui/empty-state'
import { 
  Search, 
  Send, 
  MoreVertical, 
  Phone, 
  Mail, 
  MessageCircle,
  Archive,
  Trash2,
  Tag,
  User,
  CheckCheck,
  Clock,
  Bot,
  Paperclip,
  Smile,
  LayoutTemplate,
  Filter,
  RefreshCw,
  ChevronLeft
} from 'lucide-react'
import type { Conversation, UnifiedMessage, Channel, MessageTemplate } from '@/types/unified-inbox'

const CHANNEL_ICONS: Record<string, any> = {
  email: Mail,
  whatsapp: MessageCircle,
  telegram: MessageCircle,
  instagram: MessageCircle,
  facebook: MessageCircle,
  webchat: Bot,
  sms: MessageCircle,
  phone: Phone,
}

function InboxContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [newMessage, setNewMessage] = useState('')
  const [selectedChannel, setSelectedChannel] = useState<string>('all')

  const conversationId = searchParams.get('conversation')

  // ─── Three independent queries, all cached. Switching tabs back and
  //     forth no longer triggers re-fetches; only window-focus does.
  const { data: conversations = [], isLoading: loading } = useSupabaseQuery<Conversation[]>({
    queryKey: queryKeys.inbox.conversations,
    queryFn: () =>
      supabase
        .from('conversations_view')
        .select('*')
        .order('last_message_at', { ascending: false })
        .limit(50) as unknown as Promise<{ data: Conversation[] | null; error: { message: string } | null }>,
  })

  const { data: channels = [] } = useSupabaseQuery<Channel[]>({
    queryKey: queryKeys.inbox.channels,
    queryFn: () =>
      supabase
        .from('channels')
        .select('*')
        .eq('status', 'active') as unknown as Promise<{ data: Channel[] | null; error: { message: string } | null }>,
    staleTime: 5 * 60_000, // channels rarely change
  })

  const { data: templates = [] } = useSupabaseQuery<MessageTemplate[]>({
    queryKey: queryKeys.inbox.templates,
    queryFn: () =>
      supabase
        .from('message_templates')
        .select('*')
        .eq('is_active', true) as unknown as Promise<{ data: MessageTemplate[] | null; error: { message: string } | null }>,
    staleTime: 5 * 60_000,
  })

  // ─── Selected conversation: derived from URL param + cached list.
  //     If we have it in cache (came from list click), use it; else
  //     fall back to fetching once.
  const { data: selectedConversation } = useSupabaseQuery<Conversation | null>({
    queryKey: ['inbox', 'conversation', conversationId],
    queryFn: () =>
      supabase
        .from('conversations_view')
        .select('*')
        .eq('id', conversationId!)
        .single() as unknown as Promise<{ data: Conversation | null; error: { message: string } | null }>,
    enabled: !!conversationId,
  })

  // ─── Messages depend on conversationId; only enabled when set.
  const { data: messages = [] } = useSupabaseQuery<UnifiedMessage[]>({
    queryKey: conversationId
      ? queryKeys.inbox.messages(conversationId)
      : ['inbox', 'messages', 'none'],
    queryFn: () =>
      supabase
        .from('inbox_view')
        .select('*')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: true }) as unknown as Promise<{ data: UnifiedMessage[] | null; error: { message: string } | null }>,
    enabled: !!conversationId,
  })

  // ─── Mark conversation as read whenever we open it.
  //     This is a side-effect of selecting a conversation, not a query.
  useEffect(() => {
    if (!conversationId) return
    // The supabase generated types don't expose this update — cast to bypass.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase.from('conversations') as any)
      .update({ unread_count: 0 })
      .eq('id', conversationId)
      .then(() => {
        // Optimistically mark in the cached list too — feels instant
        queryClient.setQueryData<Conversation[]>(
          queryKeys.inbox.conversations,
          (prev) =>
            prev?.map((c) => (c.id === conversationId ? { ...c, unread_count: 0 } : c)) ?? prev,
        )
      })
  }, [conversationId, queryClient])

  // ─── Realtime: when a new message arrives, append to messages cache
  //     for the affected conversation, and bump the conversations list.
  useEffect(() => {
    const subscription = supabase
      .channel('unified_messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'unified_messages' },
        (payload) => {
          const message = payload.new as UnifiedMessage
          // Append to messages cache for that conversation
          queryClient.setQueryData<UnifiedMessage[]>(
            queryKeys.inbox.messages(message.conversation_id),
            (prev) => (prev ? [...prev, message] : [message]),
          )
          // Refetch conversations list (preview, last_message_at, unread_count)
          queryClient.invalidateQueries({ queryKey: queryKeys.inbox.conversations })
        },
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [queryClient])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // ─── Send message mutation: DESPACHA por el canal real y solo después
  //     registra en unified_messages con el status verdadero. Antes solo se
  //     insertaba con status 'sent' sin enviar nada — el operador creía que
  //     respondió y el cliente jamás recibía el mensaje.
  const sendMessageMutation = useSupabaseMutation<
    { conversation: Conversation; text: string },
    void
  >({
    mutationFn: async ({ conversation, text }) => {
      const channel = channels.find((c) => c.id === conversation.channel_id)
      const channelType = channel?.type || 'webchat'
      let status: 'sent' | 'pending' = 'pending'

      if (channelType === 'whatsapp') {
        // Teléfono del contacto (la vista de conversaciones no lo trae)
        const { data: contact } = await supabase
          .from('contacts')
          .select('phone')
          .eq('id', conversation.contact_id!)
          .maybeSingle()
        const phone = (contact as { phone?: string | null } | null)?.phone
        if (!phone) throw new Error('El contacto no tiene teléfono para WhatsApp')
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, text }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || 'No se pudo enviar por WhatsApp')
        }
        status = 'sent'
      } else if (channelType === 'email') {
        const to = conversation.contact_email
        if (!to) throw new Error('El contacto no tiene email')
        const res = await fetch('/api/emails/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to,
            template: 'custom',
            subject: conversation.subject || 'Respuesta de Invent Agency',
            text,
          }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || 'No se pudo enviar el email')
        }
        status = 'sent'
      } else {
        // Canal sin despachador automático (webchat/telegram/etc.): registrar
        // como pending y avisar — nunca fingir que se envió.
        toast.warning(`El canal "${channelType}" aún no tiene despacho automático — mensaje guardado como pendiente`)
      }

      const { error } = await supabase
        .from('unified_messages')
        .insert({
          conversation_id: conversation.id,
          channel_id: conversation.channel_id,
          channel_type: channelType,
          contact_id: conversation.contact_id,
          direction: 'outbound',
          message_type: 'text',
          content: text,
          status,
          sent_at: status === 'sent' ? new Date().toISOString() : null,
        } as any)
      if (error) throw new Error(error.message)
    },
    invalidateKeys: [], // realtime subscription will append
    errorMessage: 'No se pudo enviar el mensaje',
  })

  function sendMessage() {
    if (!newMessage.trim() || !selectedConversation) return
    const text = newMessage
    setNewMessage('')
    sendMessageMutation.mutate(
      { conversation: selectedConversation, text },
      {
        onError: () => {
          // Restore draft so the user doesn't lose what they typed
          setNewMessage(text)
        },
      },
    )
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  function formatMessageDate(date: string) {
    const d = new Date(date)
    if (isToday(d)) return format(d, 'HH:mm')
    if (isYesterday(d)) return 'Ayer ' + format(d, 'HH:mm')
    return format(d, 'dd MMM HH:mm', { locale: es })
  }

  const filteredConversations = conversations.filter(conv => {
    const matchesSearch = 
      (conv.contact_first_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (conv.contact_last_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (conv.last_message_preview?.toLowerCase() || '').includes(searchQuery.toLowerCase())
    
    const matchesChannel = selectedChannel === 'all' || conv.channel_id === selectedChannel
    
    const matchesFilter = 
      activeFilter === 'all' ? true :
      activeFilter === 'unread' ? conv.unread_count > 0 :
      activeFilter === 'assigned' ? conv.assigned_to :
      activeFilter === 'unassigned' ? !conv.assigned_to :
      true
    
    return matchesSearch && matchesChannel && matchesFilter
  })

  const ChannelIcon = ({ type }: { type: string }) => {
    const Icon = CHANNEL_ICONS[type] || MessageCircle
    return <Icon className="h-4 w-4" />
  }

  // On mobile we use an iOS-style master/detail pattern:
  //  - When no conversation is selected, only the list is visible
  //  - When one is selected, only the chat is visible (with a back button)
  // On md+ both panels are visible side-by-side as before.
  const showListMobile = !selectedConversation
  const showChatMobile = !!selectedConversation

  return (
    <div className="h-[calc(100vh-7rem)] flex gap-4">
      {/* Conversations Sidebar */}
      <Card
        className={`w-full md:w-96 md:flex flex-col bg-zinc-950 border-zinc-800 flex-shrink-0 ${
          showListMobile ? 'flex' : 'hidden'
        }`}
      >
        <CardHeader className="p-4 pb-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Bandeja de Entrada</h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-zinc-400"
              title="Refrescar"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['inbox'] })}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              placeholder="Buscar conversaciones..."
              className="pl-10 bg-zinc-900 border-zinc-800 text-white"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          {/* Channel Filter */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Button
              size="sm"
              variant={selectedChannel === 'all' ? 'default' : 'outline'}
              className={selectedChannel === 'all' ? 'bg-white text-black' : 'border-zinc-700 text-zinc-400'}
              onClick={() => setSelectedChannel('all')}
            >
              Todos
            </Button>
            {channels.map(channel => (
              <Button
                key={channel.id}
                size="sm"
                variant={selectedChannel === channel.id ? 'default' : 'outline'}
                className={selectedChannel === channel.id ? 'bg-white text-black' : 'border-zinc-700 text-zinc-400'}
                onClick={() => setSelectedChannel(channel.id)}
              >
                <ChannelIcon type={channel.type} />
              </Button>
            ))}
          </div>
          
          {/* Tabs */}
          <Tabs value={activeFilter} onValueChange={setActiveFilter}>
            <TabsList className="w-full bg-zinc-900">
              <TabsTrigger value="all" className="flex-1 data-[state=active]:bg-zinc-800">Todas</TabsTrigger>
              <TabsTrigger value="unread" className="flex-1 data-[state=active]:bg-zinc-800">
                No leídas
              </TabsTrigger>
              <TabsTrigger value="assigned" className="flex-1 data-[state=active]:bg-zinc-800">
                Asignadas
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        
        <ScrollArea className="flex-1">
          <div className="divide-y divide-zinc-800">
            {loading ? (
              <div className="p-4 text-center text-zinc-500">Cargando...</div>
            ) : filteredConversations.length === 0 ? (
              <EmptyState
                icon={MessageCircle}
                title={searchQuery || activeFilter !== 'all' ? 'Sin resultados' : 'Sin conversaciones'}
                description={
                  searchQuery || activeFilter !== 'all'
                    ? 'Prueba con otros términos o cambia de filtro.'
                    : 'Cuando recibas un email, WhatsApp o mensaje desde un canal conectado, aparecerá aquí.'
                }
              />
            ) : (
              filteredConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => {
                    router.push(`/dashboard/inbox?conversation=${conversation.id}`)
                  }}
                  className={`w-full p-4 text-left hover:bg-zinc-900/50 transition-colors ${
                    selectedConversation?.id === conversation.id ? 'bg-zinc-900' : ''
                  } ${conversation.unread_count > 0 ? 'border-l-2 border-l-white' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10 bg-zinc-800">
                      <AvatarFallback className="bg-zinc-800 text-white text-sm">
                        {(conversation.contact_first_name?.[0] || '') + (conversation.contact_last_name?.[0] || '')}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className={`font-medium truncate ${conversation.unread_count > 0 ? 'text-white' : 'text-zinc-300'}`}>
                          {conversation.contact_first_name} {conversation.contact_last_name}
                        </h3>
                        <span className="text-xs text-zinc-500 flex-shrink-0">
                          {conversation.last_message_at && formatMessageDate(conversation.last_message_at)}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1 text-xs text-zinc-500 mb-1">
                        <ChannelIcon type={conversation.channel_type || 'webchat'} />
                        {conversation.channel_name && <span>{conversation.channel_name}</span>}
                        {conversation.contact_company && (
                          <span className="truncate">• {conversation.contact_company}</span>
                        )}
                      </div>
                      
                      <p className={`text-sm truncate ${conversation.unread_count > 0 ? 'text-zinc-200' : 'text-zinc-500'}`}>
                        {conversation.last_message_preview || 'Sin mensajes'}
                      </p>
                    </div>
                    
                    {conversation.unread_count > 0 && (
                      <Badge className="bg-white text-black flex-shrink-0">
                        {conversation.unread_count}
                      </Badge>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </Card>
      
      {/* Chat Area
          Mobile: visible only when a conversation is selected (showChatMobile)
          Desktop: always rendered (when there's a selectedConversation), or
          empty-state when none */}
      {selectedConversation ? (
        <Card
          className={`flex-1 flex-col bg-zinc-950 border-zinc-800 ${
            showChatMobile ? 'flex' : 'hidden md:flex'
          }`}
        >
          {/* Chat Header */}
          <CardHeader className="p-4 border-b border-zinc-800 flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden h-9 w-9 text-zinc-400"
                onClick={() => router.push('/dashboard/inbox')}
                aria-label="Volver a conversaciones"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <Avatar className="h-10 w-10 bg-zinc-800">
                <AvatarFallback className="bg-zinc-800 text-white">
                  {(selectedConversation.contact_first_name?.[0] || '') + (selectedConversation.contact_last_name?.[0] || '')}
                </AvatarFallback>
              </Avatar>
              
              <div>
                <h3 className="font-medium text-white">
                  {selectedConversation.contact_first_name} {selectedConversation.contact_last_name}
                </h3>
                <p className="text-xs text-zinc-500">
                  {selectedConversation.contact_company} • via {selectedConversation.channel_name}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400">
                <Phone className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400">
                <Tag className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                  <DropdownMenuItem className="text-white">
                    <Archive className="h-4 w-4 mr-2" />
                    Archivar
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-red-400">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>
          
          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={message.id}
                  className={`flex ${message.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg p-3 ${
                      message.direction === 'outbound'
                        ? 'bg-white text-black'
                        : 'bg-zinc-900 text-white'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    
                    <div className={`flex items-center gap-1 mt-1 text-xs ${
                      message.direction === 'outbound' ? 'text-zinc-600' : 'text-zinc-500'
                    }`}>
                      <span>{formatMessageDate(message.created_at)}</span>
                      {message.direction === 'outbound' && (
                        message.status === 'read' ? (
                          <CheckCheck className="h-3 w-3" />
                        ) : message.status === 'delivered' ? (
                          <CheckCheck className="h-3 w-3 opacity-50" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
          
          {/* Input Area */}
          <div className="p-4 border-t border-zinc-800">
            <div className="flex items-end gap-2">
              <Button variant="ghost" size="icon" className="h-10 w-10 text-zinc-400 flex-shrink-0">
                <Paperclip className="h-5 w-5" />
              </Button>
              
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-10 w-10 text-zinc-400 flex-shrink-0">
                    <LayoutTemplate className="h-5 w-5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Plantillas de Mensajes</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2 mt-4 max-h-96 overflow-y-auto">
                    {templates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => setNewMessage(template.content)}
                        className="w-full p-3 text-left rounded-lg bg-zinc-900 hover:bg-zinc-800 transition-colors"
                      >
                        <div className="font-medium text-sm">{template.name}</div>
                        <div className="text-xs text-zinc-500 truncate">{template.content}</div>
                      </button>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
              
              <div className="flex-1 relative">
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                  placeholder="Escribe un mensaje..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-white placeholder:text-zinc-500 resize-none min-h-[44px] max-h-32"
                  rows={1}
                />
              </div>
              
              <Button 
                onClick={sendMessage}
                disabled={!newMessage.trim()}
                className="bg-white text-black hover:bg-zinc-200 flex-shrink-0 h-10 w-10 p-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        // Empty state — only visible on desktop. On mobile we show the list instead.
        <Card className="hidden md:flex flex-1 items-center justify-center bg-zinc-950 border-zinc-800">
          <EmptyState
            icon={MessageCircle}
            title="Selecciona una conversación"
            description="Elige una conversación de la lista para ver los mensajes y responder."
          />
        </Card>
      )}
    </div>
  )
}

// Export with Suspense wrapper
export default function InboxPage() {
  return (
    <Suspense fallback={
      <div className="h-[calc(100vh-7rem)] flex items-center justify-center">
        <p className="text-zinc-500">Cargando inbox...</p>
      </div>
    }>
      <InboxContent />
    </Suspense>
  )
}
