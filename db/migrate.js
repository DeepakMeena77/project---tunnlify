'use strict';

/**
 * db/migrate.js
 * ─────────────
 * Idempotent schema migration.  Run once at server startup (or manually).
 *
 * Usage:
 *   node db/migrate.js          -- run migrations
 *   node db/migrate.js --drop   -- drop and recreate (DEV ONLY)
 */

require('./env');          // load .env before anything else
const { query } = require('./pool');

const DROP_SQL = `
  DROP TABLE IF EXISTS requests CASCADE;
  DROP TABLE IF EXISTS users CASCADE;
`;

const SCHEMA_SQL = `
  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id            SERIAL        PRIMARY KEY,
    email         TEXT          NOT NULL UNIQUE,
    password_hash TEXT          NOT NULL,
    subdomain     TEXT          NOT NULL UNIQUE,
    api_token     TEXT          NOT NULL UNIQUE,
    plan          TEXT          NOT NULL DEFAULT 'free',
    stripe_customer_id     TEXT,
    stripe_subscription_id TEXT,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS users_api_token_idx  ON users (api_token);
  CREATE INDEX IF NOT EXISTS users_subdomain_idx  ON users (subdomain);
  CREATE INDEX IF NOT EXISTS users_email_idx      ON users (email);

  ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

  CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_customer_id_idx
    ON users (stripe_customer_id)
    WHERE stripe_customer_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_subscription_id_idx
    ON users (stripe_subscription_id)
    WHERE stripe_subscription_id IS NOT NULL;

  -- Requests table (tunnel request inspector)
  CREATE TABLE IF NOT EXISTS requests (
    id                BIGSERIAL     PRIMARY KEY,
    user_id           INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subdomain         TEXT          NOT NULL,
    method            TEXT          NOT NULL,
    path              TEXT          NOT NULL,
    status_code       INTEGER,
    response_time_ms  INTEGER,
    request_headers   JSONB,
    request_body      TEXT,
    response_headers  JSONB,
    response_body     TEXT,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS requests_user_id_idx   ON requests (user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS requests_subdomain_idx ON requests (subdomain, created_at DESC);
`;

/**
 * After each INSERT into requests, delete all rows for that subdomain
 * beyond the newest 100. Run separately so the trigger DDL stays idempotent.
 */
const TRIGGER_SQL = `
  CREATE OR REPLACE FUNCTION prune_requests() RETURNS trigger AS $$
  BEGIN
    DELETE FROM requests
    WHERE subdomain = NEW.subdomain
      AND id NOT IN (
        SELECT id FROM requests
        WHERE subdomain = NEW.subdomain
        ORDER BY created_at DESC
        LIMIT 100
      );
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS prune_requests_trigger ON requests;
  CREATE TRIGGER prune_requests_trigger
    AFTER INSERT ON requests
    FOR EACH ROW EXECUTE FUNCTION prune_requests();
`;

async function migrate(drop = false) {
  console.log('[migrate] Running schema migration …');
  if (drop) {
    console.warn('[migrate] --drop specified: dropping existing tables!');
    await query(DROP_SQL);
  }
  await query(SCHEMA_SQL);
  await query(TRIGGER_SQL);
  console.log('[migrate] ✅ Schema up to date');
}

// ── CLI entry-point ────────────────────────────────────────────────────────────
if (require.main === module) {
  const drop = process.argv.includes('--drop');
  migrate(drop)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[migrate] ✖ Migration failed:', err.message);
      process.exit(1);
    });
}

module.exports = { migrate };
