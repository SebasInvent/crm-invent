# Integración CRM + OpenClaw + Email Campaigns

## Flujo Completo de Comunicación con Clientes

### 1. Estructura de Datos

Las siguientes tablas almacenan toda la información de interacciones:

- **`contacts`** - Clientes y leads
- **`unified_messages`** - Todos los mensajes (email, chat, whatsapp)
- **`conversations`** - Conversaciones agrupadas por contacto
- **`channels`** - Canales de comunicación (email, whatsapp, etc.)
- **`campaigns`** - Campañas de email masivo

### 2. Endpoints API

#### Enviar Campaña de Email
```
POST /api/campaigns/email
```

**Body:**
```json
{
  "contact_ids": ["uuid-1", "uuid-2", ...],
  "subject": "Oferta especial para tu empresa",
  "content": "Hola {{first_name}}, tenemos una oferta...",
  "from_name": "Agencia Invent",
  "from_email": "contacto@agenciainvent.com",
  "track_opens": true,
  "track_clicks": true
}
```

**Variables disponibles:**
- `{{first_name}}` - Nombre del contacto
- `{{last_name}}` - Apellido
- `{{company}}` - Nombre de empresa
- `{{email}}` - Email del contacto

#### Recibir Respuestas de Email
```
POST /api/webhook/email/reply
```

Configura esta URL en tu proveedor de email (SendGrid, AWS SES, etc.) para recibir:
- Respuestas de clientes
- Notificaciones de apertura (opens)
- Clicks en links
- Bounces

**Soporta:** SendGrid, AWS SES, Mailgun, Postmark

### 3. Webhook OpenClaw

```
POST /api/webhook/openclaw
```

Recibe eventos de OpenClaw:
- `conversation.started` - Nueva conversación
- `conversation.message` - Nuevo mensaje
- `conversation.ended` - Conversación finalizada
- `client.created` - Cliente creado

### 4. Configuración de Variables de Entorno

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# OpenClaw (opcional)
SYNC_SECRET=your_secret
OPENCLAW_CRM_WEBHOOK_URL=https://openclaw.yourdomain.com/webhook/crm

# Email Provider (SendGrid ejemplo)
SENDGRID_API_KEY=SG.xxxxx
```

### 5. Funciones de Seguimiento

```typescript
import { 
  getCampaignStats, 
  getContactInteractionHistory,
  getNonResponders,
  getInboxSummary 
} from '@/lib/campaign-tracking'

// Estadísticas de campaña
const stats = await getCampaignStats('campaign-uuid')

// Historial de un contacto
const history = await getContactInteractionHistory('contact-uuid')

// Quién no respondió (para follow-up)
const nonResponders = await getNonResponders('campaign-uuid', 7)

// Resumen del inbox
const inbox = await getInboxSummary(10)
```

### 6. Flujo de Trabajo Recomendado

1. **Cargar contactos** en la tabla `contacts`
2. **Enviar campaña** vía API con IDs de contactos
3. **Monitorear respuestas** en el Unified Inbox (`/dashboard/inbox`)
4. **Seguimiento automático** - Las respuestas se guardan automáticamente
5. **Reportes** - Usar las funciones de tracking para ver estadísticas

### 7. Estructura de Mensajes

Cada mensaje guardado incluye:
- Tipo de canal (email, whatsapp, etc.)
- Dirección (inbound/outbound)
- Estado (sent, delivered, read, failed)
- Metadata completa (campaign_id, opens, clicks)
- Relación con contacto y conversación

### 8. Dashboard de Inbox

Visita `/dashboard/inbox` para ver:
- Conversaciones activas
- Mensajes no leídos
- Respuestas pendientes
- Historial completo

### 9. Integración con Email Provider

Para enviar emails reales, integra tu proveedor en `sendEmailProvider()`:

**SendGrid:**
```typescript
import sgMail from '@sendgrid/mail'
sgMail.setApiKey(process.env.SENDGRID_API_KEY)
await sgMail.send({
  to: params.to,
  from: { email: params.from_email, name: params.from_name },
  subject: params.subject,
  html: params.content,
  customArgs: {
    message_id: params.message_id,
    campaign_id: params.campaign_id
  }
})
```

### 10. SQL Adicional para Funciones RPC

Ejecutar en Supabase para funciones de seguimiento:

```sql
-- Incrementar contador de interacciones
CREATE OR REPLACE FUNCTION increment_interaction_count(contact_id UUID)
RETURNS INTEGER AS $$
BEGIN
  UPDATE contacts 
  SET interaction_count = interaction_count + 1
  WHERE id = contact_id;
  
  RETURN (SELECT interaction_count FROM contacts WHERE id = contact_id);
END;
$$ LANGUAGE plpgsql;

-- Incrementar contador de mensajes no leídos
CREATE OR REPLACE FUNCTION increment_unread_count(
  p_contact_id UUID,
  p_channel_id UUID
)
RETURNS INTEGER AS $$
BEGIN
  UPDATE conversations 
  SET unread_count = unread_count + 1
  WHERE contact_id = p_contact_id 
  AND (channel_id = p_channel_id OR (channel_id IS NULL AND p_channel_id IS NULL));
  
  RETURN (SELECT unread_count FROM conversations 
          WHERE contact_id = p_contact_id 
          AND (channel_id = p_channel_id OR (channel_id IS NULL AND p_channel_id IS NULL)));
END;
$$ LANGUAGE plpgsql;
```

## Resumen

- ✅ Schema de Supabase con tablas necesarias
- ✅ API para enviar campañas de email
- ✅ Webhook para recibir respuestas
- ✅ Tracking automático de opens/clicks/replies
- ✅ Integración con Unified Inbox
- ✅ Dashboard de seguimiento

Toda la comunicación queda guardada en `unified_messages` y `conversations` para seguimiento completo.
