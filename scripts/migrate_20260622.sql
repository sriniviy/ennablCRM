-- Migration: 2026-06-22
-- Run this on the Replit database after pulling this commit.

-- Add company_id and reminder_at to tasks (for task dialog company linking + reminders)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMP WITH TIME ZONE;

-- Add last_activity_date to companies and contacts (backfilled from HubSpot export)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS last_activity_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_activity_date TIMESTAMP WITH TIME ZONE;

-- Backfill company_id on existing tasks from their linked contact or deal
UPDATE tasks t SET company_id = c.company_id
FROM contacts c
WHERE t.contact_id = c.id AND t.company_id IS NULL AND c.company_id IS NOT NULL;

UPDATE tasks t SET company_id = d.company_id
FROM deals d
WHERE t.deal_id = d.id AND t.company_id IS NULL AND d.company_id IS NOT NULL;
