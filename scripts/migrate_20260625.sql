-- Migration: 2026-06-25
-- Run this on the Replit database after pulling this commit.

-- Add invoicing_enabled flag to users (toggled per-user by admins in Settings → Teams)
ALTER TABLE users ADD COLUMN IF NOT EXISTS invoicing_enabled BOOLEAN NOT NULL DEFAULT FALSE;
