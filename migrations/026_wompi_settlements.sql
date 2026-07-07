-- 026_wompi_settlements.sql
--
-- Store de idempotencia + auditoría de las liquidaciones Wompi que llegan
-- desde el payments-hub. Una liquidación por wompi_transaction_id → el
-- callback /api/payments/wompi-callback maneja con seguridad los reintentos
-- del hub (mismo patrón que wompi_events del hub).

CREATE TABLE IF NOT EXISTS wompi_settlements (
  wompi_transaction_id text PRIMARY KEY,
  deal_id      uuid REFERENCES deals(id) ON DELETE SET NULL,
  intent_id    text,
  amount_cents bigint,
  currency     text NOT NULL DEFAULT 'COP',
  status       text NOT NULL DEFAULT 'approved',
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wompi_settlements_deal_idx ON wompi_settlements (deal_id);
