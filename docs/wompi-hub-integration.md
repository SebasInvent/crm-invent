# Integración de pagos: invent-crm ↔ payments-hub (Wompi)

invent-crm **no habla con Wompi directo**. Le pide el link de pago al
**payments-hub** (`payments.pitchbull.co`), que es el dueño único de la cuenta
Wompi y concentra todo el endurecimiento (firma constant-time, re-consulta
autoritativa de la transacción, idempotencia). Cuando el lead paga, el hub nos
hace un **callback firmado** y el deal se marca ganado.

## Flujo

```
Agente → deals/checkout ──(Bearer CHECKOUT_SERVICE_TOKEN)──▶ hub POST /v1/checkout
                                                             { platform:"INV", amount_cents, order_id: deal.id }
        ◀── { checkout_url, reference:"INV-<intent>" } ──────┘
Agente manda el checkout_url al lead
Lead paga en Wompi ──▶ hub webhook único ──(ruteo por prefijo "INV-")──▶
        hub POST callback_url  (x-pitchbull-signature: sha256=HMAC(body, callback_secret))
        ──▶ invent-crm POST /api/payments/wompi-callback
              → verifica firma → idempotencia (wompi_transaction_id)
              → mueve el deal a la etapa ganada + registra el pago
```

## 1. Env vars en invent-crm (Vercel · Production)

| Var | Valor |
|-----|-------|
| `PAYMENTS_HUB_URL` | `https://payments.pitchbull.co` |
| `CHECKOUT_SERVICE_TOKEN` | el mismo `CHECKOUT_SERVICE_TOKEN` del hub (service-to-service) |
| `WOMPI_CALLBACK_SECRET` | el `callback_secret` de la fila `platforms` (code `INV`) del hub |

Generá el secreto compartido una vez: `openssl rand -hex 32`.

## 2. Registrar invent-crm como plataforma en el hub

En la DB del **payments-hub**, insertá la plataforma (code `INV` = prefijo de
la referencia). Poné el **mismo** `callback_secret` que `WOMPI_CALLBACK_SECRET`
de arriba:

```sql
INSERT INTO platforms (code, name, callback_url, callback_secret, active)
VALUES (
  'INV',
  'Invent CRM',
  'https://control.inventagency.co/api/payments/wompi-callback',
  '<EL_MISMO_SECRET>',
  true
)
ON CONFLICT (code) DO UPDATE
  SET callback_url = EXCLUDED.callback_url,
      callback_secret = EXCLUDED.callback_secret,
      active = true;
```

No se commitea ningún secreto: el `callback_secret` vive solo en la DB del hub
y en la env de invent-crm.

## 3. Aplicar la migración

`026_wompi_settlements.sql` (tabla de idempotencia de liquidaciones) → aplicar
a Supabase con el proceso de migraciones del repo.

## 4. Probar (sandbox)

1. `POST /api/aria/actions/deals/checkout` con `{ "deal_id": "<uuid>" }` y
   `Authorization: Bearer $ARIA_ACTION_TOKEN` → devuelve `checkout_url`.
2. Abrí el `checkout_url` y pagá con las tarjetas de prueba de Wompi (sandbox
   si la public key del hub es `pub_test_…`).
3. El hub recibe el webhook, rutea por `INV-…` y llama a
   `/api/payments/wompi-callback` → el deal pasa a **ganado** y aparece el
   evento `deal_won` en el timeline (control.inventagency.co).
4. Reintentos del hub → el segundo callback sale por `evento ya procesado`
   (idempotencia OK).
