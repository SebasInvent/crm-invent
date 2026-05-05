# Schema — CRM Invent

**Source of truth:** `/migrations/*.sql`
**History (archived, do not run):** `/docs/schema-history/*.sql`

---

## How to find what's actually live

Run in Supabase SQL Editor:

```sql
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

## How to add a new schema change

1. Create `/migrations/00N_descriptive_name.sql` (next sequential number).
2. Make it idempotent where reasonable (`CREATE TABLE IF NOT EXISTS`,
   `ALTER TABLE … ADD COLUMN IF NOT EXISTS`).
3. Apply through Supabase Studio's SQL editor (or `supabase db push`
   if you set up the CLI).
4. Update this doc's "Active tables" section below.
5. Commit both the migration and the doc update in the same PR.

## Active tables (as of 2026-05-04 — best inference from code)

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `contacts` | Unified contact records | id, first_name, last_name, email, phone, company_name, organization_id |
| `clients` | **DEPRECATED** — being migrated to `contacts` | id, name, email, company, telegram_chat_id |
| `leads` | Sales prospects with Jung scoring | id, name, email, lead_score, lead_status, jung_archetype, priority |
| `chat_threads` | Bot conversations (multi-channel) | id, phone, channel, bot_active, status, last_message_at, contact_id |
| `chat_messages` | Messages within threads | id, thread_id, content, direction, sender, created_at |
| `deals` | Pipeline opportunities | id, contact_id, value, stage_id, probability, expected_close_date |
| `pipeline_stages` | Deal stages config | id, name, color, order_index, default_probability |
| `projects` | Active client projects | id, contact_id, name, status, budget, start_date |
| `documents` | File metadata (storage in Supabase Storage) | id, name, file_type, file_size_bytes, storage_path, visibility |
| `document_folders` | Folder hierarchy | id, name, parent_folder_id, visibility |
| `email_logs` | Outbound email audit | id, client_id, to_email, subject, status, sent_at, sent_by |
| `agent_tasks` | Bot work items / deliverables | id, status, completed_at, … |
| `automated_insights` | AI-generated insights | id, type, content, confidence, created_at |
| `daily_metrics` | Aggregated KPIs (probably trigger-populated) | date, new_leads, hot_leads, conversion_rate, … |

## Active views

| View | What it shows |
|------|---------------|
| `contacts_with_organization` | contacts JOIN organizations |
| `deals_full` | deals JOIN contacts JOIN pipeline_stages |
| `conversations_view` | conversations with denormalised client/agent info |
| `inbox_view` | unified messages across channels |
| `chat_threads_with_stats` | chat_threads + message count + unread |
| `pipeline_analytics_view` | per-stage analytics |
| `documents_view` | documents JOIN folders + signed URLs |

## Outstanding cleanup (tracked as future migrations)

- [ ] `migrations/003_drop_clients_table.sql` — once all code paths read
      from `contacts`. Currently `/dashboard/clients/page.tsx` still
      reads `from('clients')` so dropping the table now would break it.
- [ ] Standardize column naming: pick `company_name` everywhere
      (currently mixed with `company`).
- [ ] Document the trigger / cron job that populates `daily_metrics`.
- [ ] Verify `automated_insights` is actually used; if not, drop it.
