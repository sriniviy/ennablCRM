import { db } from "./index";
import { sql } from "drizzle-orm";

export async function migrateGmail() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_gmail_tokens (
      id text PRIMARY KEY,
      user_id text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      email text NOT NULL,
      access_token text NOT NULL,
      refresh_token text NOT NULL,
      expiry_date bigint NOT NULL,
      connected_at timestamptz NOT NULL DEFAULT now(),
      last_sync timestamptz
    )
  `);

  // Add thread_id column for email thread grouping (idempotent)
  await db.execute(sql`
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS thread_id text
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS oauth_states (
      state text PRIMARY KEY,
      user_id text NOT NULL,
      expires_at timestamptz NOT NULL
    )
  `);

  // Clean up expired OAuth states on startup
  await db.execute(sql`
    DELETE FROM oauth_states WHERE expires_at < now()
  `);
}

export async function migrateMeeting() {
  // Ensure MEETING exists in the activity_type enum (idempotent)
  await db.execute(sql`
    DO $$ BEGIN
      ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'MEETING';
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `);
}

export async function migrateUsers() {
  // Add invoicing_enabled column for per-user invoicing access (idempotent)
  await db.execute(sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS invoicing_enabled boolean NOT NULL DEFAULT false
  `);
}
