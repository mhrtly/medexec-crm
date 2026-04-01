# Supabase Config
- Project ID: bcjahzdtuowhaysxzzgz
- URL: https://bcjahzdtuowhaysxzzgz.supabase.co
- Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjamFoemR0dW93aGF5c3h6emd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODg1MzQsImV4cCI6MjA5MDU2NDUzNH0.c6qeh9CpPIJhPzR-cfPL994UNOUnXjFYYsOTzM8K-3w

## Tables
- contacts (3502 rows) - id, first_name, last_name, full_name, title, seniority, org_id (FK→organizations), email, phone, linkedin_url, bio, profile_notes, gender, gender_method, relationship_status, warmth, last_contacted, next_action, crm_notes, assigned_to, source_type, source_url, first_found, last_enriched, confidence, enrichment_flags (jsonb), is_verified, is_duplicate, duplicate_of, created_at, updated_at
- organizations (1355 rows) - id, name, parent_org, hq_city, hq_state, website, product_category, revenue_estimate, headcount_estimate, public_or_private, ticker, description, org_relationship, sponsor_level, org_notes, source, last_enriched, leadership_page_url, last_leadership_crawl, created_at, updated_at
- tags (14 rows) - id, name, category
- contact_tags (0 rows) - contact_id, tag_id, tagged_by, tagged_at
- sightings (3380 rows) - id, contact_id, source_type, source_name, source_url, context, detail_type, detail_value, found_at
- interactions (0 rows) - id, contact_id, interaction_type, subject, body, logged_by, occurred_at
- sources_log (137 rows) - id, source_name, source_url, source_type, status, contacts_found, orgs_found, notes, logged_at
- agent_queue (0 rows) - id, action_type, target, priority, status, requested_by, result_summary, created_at, completed_at
- outreach_campaigns (0 rows) - id, name, channel, status, target_tags (jsonb), notes, created_at
- campaign_contacts (0 rows) - campaign_id, contact_id, status, sent_at, responded_at, notes

## RLS
All tables have RLS enabled. Authenticated users have full read access. Write access on contacts, organizations, interactions, contact_tags, tags, agent_queue, outreach_campaigns, campaign_contacts.
