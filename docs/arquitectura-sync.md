# Arquitectura de Sincronización - OpenClaw ↔ CRM Invent

## 📋 Resumen de Opciones

### Opción 1: Sync Bidireccional (Conservar Postgres + Supabase)
**Cuándo usar:** OpenClaw ya está en producción con datos importantes

```
┌─────────────┐     Webhook/API     ┌─────────────┐
│  OpenClaw   │ ───────────────────>│  CRM Invent   │
│  (Postgres) │                     │  (Supabase)   │
│             │<────────────────────│               │
└─────────────┘     (opcional)       └─────────────┘
```

**Pros:**
- ✅ No riesgo de migración
- ✅ OpenClaw sigue funcionando igual
- ✅ Desacoplamiento de sistemas

**Contras:**
- ❌ Latencia en sync
- ❌ Código duplicado
- ❌ Más puntos de fallo

---

### Opción 2: Unificación (Migrar todo a Supabase)
**Cuándo usar:** OpenClaw es nuevo o puede modificarse

```
┌─────────────────────────────────────────┐
│           SUPABASE (única BD)           │
│  ┌─────────┐    ┌─────────┐    ┌──────┐ │
│  │OpenClaw │    │  CRM    │    │ Auth │ │
│  │ Tables  │    │ Tables  │    │      │ │
│  └─────────┘    └─────────┘    └──────┘ │
└─────────────────────────────────────────┘
```

**Pros:**
- ✅ Tiempo real
- ✅ Menos código
- ✅ Un solo lugar de verdad
- ✅ Escalabilidad automática

**Contras:**
- ❌ Esfuerzo de migración
- ❌ Riesgo de romper OpenClaw

---

## 🎯 Recomendación

### **Si OpenClaw YA está en producción:**
**Usar Opción 1** con sync via webhooks.

Pasos:
1. Configurar OpenClaw para enviar webhooks al CRM
2. Crear endpoint en CRM para recibir datos
3. Sincronizar solo lo necesario (clientes, conversaciones)

### **Si OpenClaw es nuevo o puede modificarse:**
**Usar Opción 2** - Migrar todo a Supabase.

Pasos:
1. Crear schema de OpenClaw en Supabase
2. Modificar OpenClaw para usar Supabase
3. Eliminar duplicación

---

## 🔧 Implementación Opción 1: Sync Postgres → Supabase

### Paso 1: Configurar Webhook en OpenClaw

Agregar en la config de OpenClaw:
```yaml
webhooks:
  crm_invent:
    url: https://crm-invent.vercel.app/api/webhook/openclaw
    events:
      - conversation.started
      - conversation.message
      - conversation.ended
      - client.created
    headers:
      Authorization: Bearer ${SYNC_SECRET}
```

### Paso 2: Crear triggers en Postgres (opcional)

Si OpenClaw no tiene webhooks nativos, usar `pg_notify`:

```sql
-- Trigger para nuevas conversaciones
CREATE OR REPLACE FUNCTION notify_new_conversation()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('conversation_new', 
    json_build_object(
      'client_id', NEW.client_id,
      'message', NEW.message,
      'session_id', NEW.session_id
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conversation_trigger
AFTER INSERT ON conversations
FOR EACH ROW EXECUTE FUNCTION notify_new_conversation();
```

### Paso 3: Script de sync en Python/Node

```python
# sync_service.py
import asyncio
import asyncpg
import httpx
import os

SUPABASE_URL = os.getenv('SUPABASE_URL')
WEBHOOK_URL = os.getenv('CRM_WEBHOOK_URL')
SYNC_SECRET = os.getenv('SYNC_SECRET')

async def listen_for_changes():
    conn = await asyncpg.connect('postgresql://localhost/openclaw')
    await conn.add_listener('conversation_new', handle_new_conversation)
    
    while True:
        await asyncio.sleep(1)

async def handle_new_conversation(connection, pid, channel, payload):
    data = json.loads(payload)
    
    async with httpx.AsyncClient() as client:
        await client.post(
            WEBHOOK_URL,
            headers={'Authorization': f'Bearer {SYNC_SECRET}'},
            json={
                'event': 'conversation.message',
                'session_id': data['session_id'],
                'data': {
                    'client': {'name': data['client_name']},
                    'message': {'content': data['message']}
                }
            }
        )

if __name__ == '__main__':
    asyncio.run(listen_for_changes())
```

---

## 🔧 Implementación Opción 2: Migrar a Supabase

### Paso 1: Crear tablas de OpenClaw en Supabase

```sql
-- Tablas de OpenClaw en Supabase
CREATE TABLE openclaw_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  session_id TEXT NOT NULL,
  message TEXT NOT NULL,
  sender_type TEXT DEFAULT 'client',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE openclaw_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  session_id TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'active',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE
);
```

### Paso 2: Modificar OpenClaw

Cambiar la conexión de Postgres local a Supabase:
```python
# Antes
DATABASE_URL = "postgresql://localhost:5432/openclaw"

# Después  
DATABASE_URL = "postgresql://db.xxx.supabase.co:5432/postgres"
```

### Paso 3: Unificar clientes

Los clientes se comparten entre OpenClaw y CRM:
- Tabla `clients` es única
- OpenClaw y CRM leen/escriben en la misma tabla
- No hay duplicación

---

## 🚀 Decisión

**¿Qué prefieres?**

**A.** Sync (mantener Postgres + Supabase separados)
**B.** Unificar (migrar todo a Supabase)

Dime cuál y te preparo la implementación completa.
