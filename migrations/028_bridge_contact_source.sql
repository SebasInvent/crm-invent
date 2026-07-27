-- 030_bridge_contact_source.sql
-- Contacts received from the peer CRM retain explicit integration provenance.

ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_source_check CHECK (source IN (
  'manual','telegram','openclaw','whatsapp','web_form','referral','linkedin',
  'scraped','event','cold_outreach','integration','other'
));
