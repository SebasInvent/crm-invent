# Resumen de Implementación: Consolidación de Sincronización de Clientes

## ✅ Cambios Completados

### 1. Migración de Datos (SQL)
**Archivo:** `migrations/001_migrate_clients_to_contacts.sql`

- Script para migrar datos de tabla `clients` (antigua) a `contacts` (nueva)
- Mapeo de campos: `name` → `first_name` + `last_name`, `company` → `company_name`
- Preservación de external_ids en `custom_fields`
- Actualización de referencias en tablas hijas (`chat_sessions`, `conversations`)
- Índices para búsquedas eficientes
- Función SQL `find_contact_by_email_or_legacy()`

### 2. Actualización de Utilidades
**Archivo:** `src/lib/auto-create.ts`

- ✅ Renombrado `findExistingClient` → `findExistingContact`
- ✅ Renombrado `createClientFromInteraction` → `createContactFromInteraction`
- ✅ Actualizado `processNewInteraction` para usar tabla `contacts`
- ✅ Estructura adaptada a campos `first_name`, `last_name`, `company_name`
- ✅ Metadata de fuente guardada en `custom_fields`

### 3. Webhooks Actualizados

#### 3.1 OpenClaw Webhook
**Archivo:** `src/app/api/webhook/openclaw/route.ts`

- ✅ Import de `contactService` en lugar de `processNewInteraction`
- ✅ `handleConversationStarted` usa `contactService.findOrCreate()`
- ✅ `handleConversationMessage` usa `contactService.findContact()` y `createContact()`
- ✅ `handleClientCreated` usa `contactService.findOrCreate()`
- ✅ `handleProjectRequested` usa `contactService.findContact()`
- ✅ Todas las referencias a `client_id` → `contact_id`
- ✅ Búsqueda por `custom_fields->>openclaw_session_id`

#### 3.2 Email Reply Webhook
**Archivo:** `src/app/api/webhook/email/reply/route.ts`

- ✅ Import de `contactService`
- ✅ `handleEmailReply` usa `contactService.findOrCreate()`
- ✅ Consistente con otros webhooks

### 4. Nuevo Servicio Unificado
**Archivo:** `src/lib/contact-service.ts`

- ✅ `ContactService` clase centralizada
- ✅ `findContact()` - busca por email, teléfono, external_id
- ✅ `findOrCreate()` - busca o crea contacto
- ✅ `createContact()` - crea con estructura correcta
- ✅ `updateLastInteraction()` - actualiza timestamp
- ✅ `mergeDuplicateContacts()` - fusiona duplicados
- ✅ `findPotentialDuplicates()` - detecta duplicados
- ✅ Mapeo automático de external_ids según fuente
- ✅ Singleton export `contactService` para uso global

## 🗄️ Estructura de Datos Consolidada

### Tabla `contacts` (única fuente de verdad)
```sql
- id: UUID (PK)
- first_name: TEXT
- last_name: TEXT  
- email: TEXT
- phone: TEXT
- company_name: TEXT
- type: 'lead' | 'prospect' | 'customer' | 'partner' | 'inactive'
- status: 'active' | 'inactive'
- lead_source: TEXT
- custom_fields: JSONB  ← Guarda external_ids aquí
- last_interaction_at: TIMESTAMP
- legacy_client_id: UUID ← Temporal para migración
```

### Mapeo de External IDs (en custom_fields)
| Fuente | Campo |
|--------|-------|
| OpenClaw | `openclaw_session_id` |
| Telegram | `telegram_chat_id` |
| Email | `email_campaign_id` |
| WhatsApp | `whatsapp_number` |
| Web | `web_session_id` |

## 🔗 Referencias Actualizadas

### Tablas hijas (FKs actualizadas)
- `chat_sessions.contact_id` ← Antes `client_id`
- `conversations.contact_id` ← Antes `client_id`
- `chat_sessions.external_session_id` ← Para trazabilidad
- `unified_messages.contact_id` ← Ya correcto
- `deals.contact_id` ← Ya correcto

## 🧪 Testing Recomendado

1. **Ejecutar migración SQL en staging**
   ```bash
   psql $DATABASE_URL -f migrations/001_migrate_clients_to_contacts.sql
   ```

2. **Verificar conteos**
   ```sql
   SELECT 
     (SELECT COUNT(*) FROM clients) as clients_originales,
     (SELECT COUNT(*) FROM contacts WHERE custom_fields->>'migrated_from_clients' = 'true') as migrados,
     (SELECT COUNT(*) FROM contacts) as total_contacts;
   ```

3. **Test webhook OpenClaw**
   ```bash
   curl -X POST /api/webhook/openclaw \
     -H "Content-Type: application/json" \
     -d '{"event":"conversation.started","session_id":"test123","data":{"client":{"name":"Test User","email":"test@example.com"}}}'
   ```

4. **Verificar contacto creado**
   ```sql
   SELECT * FROM contacts WHERE email = 'test@example.com';
   ```

## 📝 Próximos Pasos (Opcionales)

- [ ] Eliminar columna `legacy_client_id` después de verificar migración
- [ ] Crear índice GIN en `custom_fields` para búsquedas eficientes
- [ ] Implementar validación de email más estricta
- [ ] Agregar rate limiting a webhooks
- [ ] Crear dashboard de sincronización

## 🎯 Resultado

✅ **Sistema unificado de contactos:** Todos los webhooks (OpenClaw, Email, futuros) usan el mismo servicio centralizado
✅ **Sin duplicados:** Lógica de búsqueda prioriza email → teléfono → external_id
✅ **Trazabilidad:** Cada contacto guarda su origen en `lead_source` y external_ids en `custom_fields`
✅ **Escalable:** Nuevas fuentes se agregan fácilmente al servicio unificado
