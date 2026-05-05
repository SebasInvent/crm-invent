# Aria Action Tools — n8n integration

Aria lives in n8n. To give her superpowers over the CRM, we expose
authenticated endpoints under `/api/aria/actions/*`. The n8n workflow
configures HTTP Request nodes that call these endpoints; the LLM in
the workflow decides which one to call based on the conversation.

## Auth

All endpoints require an `ARIA_ACTION_TOKEN` shared secret.

- Set `ARIA_ACTION_TOKEN` in **Vercel** (Production env) → a long
  random string. Generate one with `openssl rand -hex 32`.
- Set the same value in **n8n** as a credential or workflow variable.
- Pass it as `Authorization: Bearer <token>` (preferred) or as the
  `X-Aria-Token` header.

If the env var is missing on Vercel, every endpoint returns 503.
If the token is wrong, 401. Constant-time comparison protects against
timing attacks.

Rate limits are enforced per IP per endpoint (see each route).

All actions are logged to Vercel logs as
`[aria-action] {ts, action, result, payload, error}` so you can audit.

## Endpoints

### 🔍 Search — find any entity

`GET /api/aria/actions/search?q=<text>&entity=<contact|lead|deal|all>&limit=<n>`

Searches contacts (name/email/phone/company), leads (name/email/company),
and deals (name/contact). Returns matching rows with the most useful
fields each.

```bash
curl "https://crm-invent.vercel.app/api/aria/actions/search?q=acme&entity=lead&limit=5" \
  -H "Authorization: Bearer $ARIA_ACTION_TOKEN"
```

Response:

```json
{
  "ok": true,
  "query": "acme",
  "results": {
    "leads": [
      { "id": "uuid", "name": "Acme SAS", "email": "...", "lead_status": "warm", "lead_score": 75 }
    ]
  }
}
```

Rate limit: 60/min.

### 📊 Stats — pipeline snapshot

`GET /api/aria/actions/stats`

Returns leads-by-status, follow-ups due in next 7 days, open deals
count + total value + weighted value, contacts-by-type, chat-thread
activity.

```bash
curl "https://crm-invent.vercel.app/api/aria/actions/stats" \
  -H "Authorization: Bearer $ARIA_ACTION_TOKEN"
```

Rate limit: 30/min.

### ➕ Create contact

`POST /api/aria/actions/contacts/create`

Body (only `first_name` is required):

```json
{
  "first_name": "Juan",
  "last_name": "Pérez",
  "email": "juan@empresa.com",
  "phone": "+57300000000",
  "company_name": "Empresa S.A.",
  "type": "lead",
  "source": "telegram",
  "notes": "Conoció a Sebas en evento X"
}
```

Rate limit: 20/min.

### ➕ Create lead

`POST /api/aria/actions/leads/create`

Body (only `name` is required):

```json
{
  "name": "Pedro Gómez",
  "email": "pedro@x.com",
  "company": "X Corp",
  "lead_status": "warm",
  "lead_score": 60,
  "priority": "medium",
  "jung_archetype": "ruler_executive",
  "next_follow_up_date": "2026-05-12T15:00:00Z"
}
```

Rate limit: 30/min.

### ✏️ Update lead

`PATCH /api/aria/actions/leads/update`

Body must include `id` and at least one other field:

```json
{
  "id": "lead-uuid",
  "lead_status": "hot",
  "lead_score": 85,
  "next_follow_up_date": "2026-05-08T10:00:00Z"
}
```

Rate limit: 60/min.

### 🔀 Move deal

`POST /api/aria/actions/deals/move`

Body must include `deal_id` AND either `stage_id` or `stage_name`
(case-insensitive ilike match):

```json
{
  "deal_id": "deal-uuid",
  "stage_name": "Negociación"
}
```

Probability is set to the stage's default unless you pass it explicitly.

Rate limit: 60/min.

## Wiring in n8n

For each action, add an **HTTP Request** node to your Aria workflow:

1. **Method & URL** as documented above
2. **Authentication**: Generic Credential → Header Auth →
   - Name: `Authorization`
   - Value: `Bearer {{ $env.ARIA_ACTION_TOKEN }}` (or pull from a secret)
3. **Body** (for POST/PATCH): JSON, fill from the AI Agent's tool args
4. **Tool description** for the AI Agent — copy from this doc so the
   LLM knows when to call it

Example tool description for the Agent node:

> **search_crm**: Search contacts, leads, or deals by name, email,
> phone, or company. Use when the user asks "tenemos a...?" or
> "encuentra el lead de...". Returns up to 10 matches per entity.

## Adding more actions

Pattern for new endpoints:

1. Create `src/app/api/aria/actions/<entity>/<verb>/route.ts`
2. Use the helpers:
   ```ts
   import { requireAriaAuth, logAriaAction } from '@/lib/aria-auth'
   import { rateLimitOrBlock } from '@/lib/rate-limit'
   import { z } from 'zod'
   ```
3. Validate body with Zod, return 400 on parse failure
4. Use `getServiceRoleClient()` for the mutation (bypasses RLS)
5. Log via `logAriaAction(name, payload, 'ok' | 'error', msg?)`
6. Document here with curl example + rate limit
