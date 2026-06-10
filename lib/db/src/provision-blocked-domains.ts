import { sql } from "drizzle-orm";
import { db, pool } from "./index";
import { DEFAULT_FREE_EMAIL_DOMAINS } from "./constants";

/**
 * Idempotent provisioning for the `blocked_domains` table. Safe to run on every
 * merge: creates the table if missing and seeds the default free-email domains.
 * Deliberately uses CREATE TABLE IF NOT EXISTS instead of `drizzle-kit push`,
 * which can prompt to truncate other tables when the live schema has drift.
 */
async function main() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS blocked_domains (
      id text PRIMARY KEY,
      domain text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  for (const domain of DEFAULT_FREE_EMAIL_DOMAINS) {
    await db.execute(sql`
      INSERT INTO blocked_domains (id, domain)
      VALUES (gen_random_uuid()::text, ${domain})
      ON CONFLICT (domain) DO NOTHING;
    `);
  }

  console.log(`Provisioned blocked_domains (${DEFAULT_FREE_EMAIL_DOMAINS.length} defaults ensured)`);
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed to provision blocked_domains:", err);
    process.exit(1);
  });
