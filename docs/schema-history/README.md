# Schema history (archive only)

These 14 SQL files lived at the repo root through 2025–early 2026. They
were snapshots/drafts of evolving table designs and **conflict with each
other** — three different definitions of `contacts`, two of `clients`,
inconsistent column names (`company` vs `company_name`, etc).

They are kept here for archeology only. **Do not run them.**

## Source of truth (going forward)

`/migrations/*.sql` is now the only place we manage schema changes.
Apply migrations in order via Supabase Studio or the Supabase CLI:

```sql
-- in order
migrations/000_fix_contacts_schema.sql
migrations/001_migrate_clients_to_contacts.sql
migrations/002_chat_threads_messages.sql
-- (future migrations: 003_…, 004_…)
```

## What's actually live in Supabase

To see the truth at any time, open **Supabase SQL Editor** and run:

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

That output is the only authoritative description of the live schema.

## Files in this folder (archived)

| File | What it tried to do |
|------|---------------------|
| `supabase_schema.sql` | Initial base schema |
| `supabase_complete_schema.sql` | "Complete" expansion (overlaps 1) |
| `supabase_unified_schema.sql` | Inbox unification attempt |
| `supabase_unified_schema_clean.sql` | Cleanup of #3 (incomplete) |
| `supabase_core_minimal.sql` | Minimal core (intersect of others) |
| `supabase_crm_core_schema.sql` | CRM-specific tables |
| `supabase_analytics_schema.sql` | Daily metrics + insights |
| `supabase_api_marketplace_schema.sql` | API marketplace draft |
| `supabase_documents_schema.sql` | Files / folders |
| `supabase_finance_schema.sql` | Invoices / quotes |
| `supabase_leads_schema.sql` | Leads + Jung archetypes |
| `supabase_openclaw_addon.sql` | OpenClaw integration tables |
| `supabase_projects_enhanced_schema.sql` | Projects v2 with Gantt |
| `supabase_unified_inbox_schema.sql` | Final inbox model (superseded) |
