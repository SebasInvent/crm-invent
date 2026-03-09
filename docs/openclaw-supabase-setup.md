# Guía de Configuración - OpenClaw + Supabase

## 🎯 Resumen

Esta guía configura OpenClaw para usar **Supabase directamente** como su base de datos, unificando todo con el CRM Invent.

## ✅ Ventajas de esta arquitectura

- **Una sola base de datos** para todo
- **Tiempo real**: El CRM ve las conversaciones instantáneamente
- **Sin sincronización**: No hay delay ni duplicación de datos
- **Escalable**: Supabase maneja la infraestructura

---

## 📋 Paso 1: Ejecutar Schema en Supabase

1. Ve a tu proyecto de Supabase: https://app.supabase.com
2. Abre el **SQL Editor**
3. Crea una **New Query**
4. Copia y pega el contenido de `supabase_unified_schema.sql`
5. Click en **Run**

Esto creará:
- ✅ Tablas de OpenClaw (`openclaw_sessions`, `openclaw_messages`, etc.)
- ✅ Tablas CRM (`clients`, `projects`, `conversations`, etc.)
- ✅ Vistas para consultas fáciles
- ✅ Triggers para sincronización automática
- ✅ Políticas RLS

---

## 🔌 Paso 2: Configurar OpenClaw

### 2.1 Variables de Entorno en OpenClaw

Agrega estas variables en tu `.env` de OpenClaw:

```env
# Supabase Connection
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=eyJxxxx  # Service Role Key (NO la anon key)

# Opcional: Webhook para notificaciones adicionales
CRM_WEBHOOK_URL=https://crm-invent.vercel.app/api/webhook/openclaw-unified
```

### 2.2 Obtener Service Role Key

1. Ve a Supabase Dashboard → Project Settings → API
2. Copia la **"service_role" key** (no uses la anon/public)
3. Pégala en `SUPABASE_KEY`

⚠️ **IMPORTANTE**: La Service Role Key tiene acceso total. Guárdala segura.

---

## 📝 Paso 3: Modificar Código de OpenClaw

### 3.1 Instalar cliente Supabase

```bash
pip install supabase
# o
npm install @supabase/supabase-js
```

### 3.2 Crear conexión a Supabase (Python)

Crea archivo `database.py`:

```python
from supabase import create_client
import os

# Configuración
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')

# Cliente global
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

class OpenClawDatabase:
    """Wrapper para operaciones de OpenClaw en Supabase"""
    
    def __init__(self):
        self.db = supabase
    
    def create_or_get_client(self, session_id: str, client_data: dict):
        """Busca o crea cliente por session_id"""
        
        # Buscar existente
        result = self.db.table('clients') \
            .select('*') \
            .eq('openclaw_session_id', session_id) \
            .execute()
        
        if result.data:
            return result.data[0]
        
        # Crear nuevo
        new_client = self.db.table('clients').insert({
            'name': client_data['name'],
            'email': client_data.get('email'),
            'phone': client_data.get('phone'),
            'company': client_data.get('company'),
            'status': 'lead',
            'priority': 'medium',
            'source': 'openclaw',
            'openclaw_session_id': session_id
        }).execute()
        
        return new_client.data[0]
    
    def create_session(self, client_id: str, session_id: str, context: dict = None):
        """Crea nueva sesión de OpenClaw"""
        
        return self.db.table('openclaw_sessions').insert({
            'client_id': client_id,
            'session_id': session_id,
            'status': 'active',
            'context': context or {},
            'channel': 'web'
        }).execute()
    
    def save_message(self, session_id: str, client_id: str, 
                     role: str, content: str, metadata: dict = None):
        """Guarda mensaje en la conversación"""
        
        # 1. Guardar en openclaw_messages
        message = self.db.table('openclaw_messages').insert({
            'session_id': session_id,
            'client_id': client_id,
            'role': role,
            'content': content,
            'model': metadata.get('model'),
            'tokens_used': metadata.get('tokens_used'),
            'latency_ms': metadata.get('latency_ms')
        }).execute()
        
        # 2. Si es mensaje del usuario, guardar también en conversations (CRM)
        if role == 'user':
            self.db.table('conversations').insert({
                'client_id': client_id,
                'message': content,
                'channel': 'openclaw',
                'sender_type': 'client',
                'openclaw_session_id': session_id
            }).execute()
        
        # 3. Actualizar contador en sesión
        self.db.table('openclaw_sessions') \
            .update({
                'message_count': self.db.rpc('increment_message_count', {'sid': session_id})
            }) \
            .eq('session_id', session_id) \
            .execute()
        
        return message.data[0]
    
    def update_context(self, session_id: str, key: str, value: any):
        """Actualiza contexto de sesión"""
        
        return self.db.table('openclaw_contexts').upsert({
            'session_id': session_id,
            'key': key,
            'value': value
        }).execute()
    
    def get_context(self, session_id: str):
        """Obtiene todo el contexto de una sesión"""
        
        result = self.db.table('openclaw_contexts') \
            .select('*') \
            .eq('session_id', session_id) \
            .execute()
        
        return {item['key']: item['value'] for item in result.data}
    
    def close_session(self, session_id: str, summary: str = None):
        """Cierra sesión"""
        
        return self.db.table('openclaw_sessions') \
            .update({
                'status': 'ended',
                'end_time': 'now()',
                'context': {'summary': summary}
            }) \
            .eq('session_id', session_id) \
            .execute()

# Instancia global
db = OpenClawDatabase()
```

### 3.3 Uso en tu código de OpenClaw

```python
from database import db

class OpenClawAgent:
    def start_conversation(self, session_id: str, client_data: dict):
        # 1. Crear/obtener cliente
        client = db.create_or_get_client(session_id, client_data)
        
        # 2. Crear sesión
        db.create_session(client['id'], session_id)
        
        # 3. Notificar al CRM (opcional)
        self.notify_crm('conversation.started', {
            'client_id': client['id'],
            'session_id': session_id
        })
        
        return client
    
    def process_message(self, session_id: str, message: str):
        # 1. Obtener contexto
        context = db.get_context(session_id)
        
        # 2. Procesar con tu LLM
        response = self.llm.generate(message, context)
        
        # 3. Guardar mensaje del usuario
        client = db.create_or_get_client(session_id, {'name': 'Unknown'})
        db.save_message(
            session_id=session_id,
            client_id=client['id'],
            role='user',
            content=message
        )
        
        # 4. Guardar respuesta del asistente
        db.save_message(
            session_id=session_id,
            client_id=client['id'],
            role='assistant',
            content=response,
            metadata={
                'model': self.model_name,
                'tokens_used': response.tokens,
                'latency_ms': response.latency
            }
        )
        
        # 5. Actualizar contexto
        db.update_context(session_id, 'last_topic', self.detect_topic(message))
        
        return response
```

---

## 🔄 Paso 4: Flujo de Datos

Cuando un cliente habla con OpenClaw:

```
1. Cliente envía mensaje a OpenClaw
2. OpenClaw guarda en Supabase:
   - openclaw_messages (detalle completo)
   - conversations (resumen para CRM)
3. El CRM lo ve INSTANTÁNEAMENTE
4. No hay sincronización, no hay delay
```

---

## 🧪 Paso 5: Testing

### 5.1 Verificar conexión

```python
# test_connection.py
from database import db

# Probar crear cliente
test_client = db.create_or_get_client(
    'test_session_123',
    {'name': 'Test User', 'email': 'test@test.com'}
)
print(f"Cliente creado: {test_client['id']}")

# Ver en Supabase Dashboard → Table Editor → clients
```

### 5.2 Ver en CRM

1. Abre https://crm-invent.vercel.app/dashboard/clients
2. Deberías ver el cliente "Test User" con source: openclaw
3. Click en el cliente → ver conversaciones

---

## 📊 Queries Útiles en Supabase

### Ver sesiones activas
```sql
SELECT * FROM active_sessions_with_clients;
```

### Ver resumen de cliente
```sql
SELECT * FROM client_activity_summary 
WHERE email = 'cliente@ejemplo.com';
```

### Mensajes de una sesión
```sql
SELECT * FROM openclaw_messages 
WHERE session_id = 'tu-session-id'
ORDER BY created_at;
```

---

## 🚀 Paso 6: Deploy

Una vez configurado:

1. **Deploy de OpenClaw**: Sube tu código con las modificaciones
2. **Verificar logs**: Revisa que no hay errores de conexión
3. **Probar flujo completo**: Enviar mensaje y verlo en CRM

---

## 🆘 Troubleshooting

### Error: "relation does not exist"
- **Causa**: No ejecutaste el schema SQL
- **Fix**: Corre `supabase_unified_schema.sql` en SQL Editor

### Error: "Invalid API key"
- **Causa**: Usando anon key en lugar de service_role key
- **Fix**: Cambia a service_role key en las env vars

### Clientes no aparecen en CRM
- **Causa**: No se está guardando en tabla `conversations`
- **Fix**: Verifica que `save_message()` guarda mensajes user en `conversations`

---

## 📞 Soporte

Si tienes problemas:
1. Ver logs de OpenClaw
2. Ver logs de Supabase (Dashboard → Logs)
3. Probar queries directamente en SQL Editor
4. Revisar network tab en browser (si hay frontend)

---

## ✅ Checklist Final

- [ ] Schema SQL ejecutado en Supabase
- [ ] Variables de entorno configuradas
- [ ] Código de conexión implementado
- [ ] `create_or_get_client()` funcionando
- [ ] `save_message()` guardando en ambas tablas
- [ ] Ver cliente de prueba en CRM
- [ ] Ver conversación en CRM
- [ ] Deploy a producción

¡Listo! OpenClaw y CRM ahora comparten la misma base de datos Supabase.
