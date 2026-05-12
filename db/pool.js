'use strict';

/**
 * db/pool.js
 * ──────────
 * Shared PostgreSQL connection pool.
 * Reads DATABASE_URL (or individual PG* env vars) at startup.
 *
 * Import this wherever you need a DB query:
 *   const { query } = require('./pool');
 *   const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const USE_FILE_DB = process.env.DB_DRIVER === 'file' ||
  (!process.env.DATABASE_URL && !process.env.PGHOST && process.env.NODE_ENV !== 'production');

if (USE_FILE_DB) {
  process.env.DB_DRIVER = 'file';
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[DB] Using file-backed dev database at db/dev-data.json');
  }
} else if (!process.env.DATABASE_URL && !process.env.PGHOST) {
  process.env.DATABASE_URL = 'postgresql://postgres:password@127.0.0.1:5432/tunnlify';
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      '[DB] No database config found; using local dev default:\n' +
      `     ${process.env.DATABASE_URL}\n` +
      '     Override it with DATABASE_URL or PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD.'
    );
  }
}

const DEV_DB_FILE = path.resolve(__dirname, 'dev-data.json');

function emptyStore() {
  return {
    users: [],
    requests: [],
    nextUserId: 1,
    nextRequestId: 1,
  };
}

function loadStore() {
  if (!fs.existsSync(DEV_DB_FILE)) return emptyStore();
  try {
    return { ...emptyStore(), ...JSON.parse(fs.readFileSync(DEV_DB_FILE, 'utf8')) };
  } catch {
    return emptyStore();
  }
}

function saveStore(store) {
  fs.writeFileSync(DEV_DB_FILE, JSON.stringify(store, null, 2));
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    subdomain: row.subdomain,
    api_token: row.api_token,
    plan: row.plan,
    created_at: row.created_at,
  };
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function result(rows = [], rowCount = rows.length) {
  return { rows, rowCount };
}

async function fileQuery(text, params = []) {
  const sql = text.replace(/\s+/g, ' ').trim().toLowerCase();
  const store = loadStore();

  if (
    sql.startsWith('create ') ||
    sql.startsWith('alter ') ||
    sql.startsWith('drop ') ||
    sql.includes('create table') ||
    sql.includes('alter table') ||
    sql.includes('create index') ||
    sql.includes('create unique index') ||
    sql.includes('drop trigger') ||
    sql.startsWith('begin') ||
    sql.startsWith('delete from requests where subdomain = new.subdomain') ||
    sql.includes('create or replace function prune_requests')
  ) {
    if (!fs.existsSync(DEV_DB_FILE)) saveStore(store);
    return result();
  }

  if (sql.includes('select * from users where id = $1')) {
    return result(store.users.filter((u) => u.id === Number(params[0])));
  }
  if (sql.includes('select * from users where email = $1')) {
    const email = String(params[0] || '').toLowerCase().trim();
    return result(store.users.filter((u) => u.email === email));
  }
  if (sql.includes('select * from users where stripe_customer_id = $1')) {
    return result(store.users.filter((u) => u.stripe_customer_id === params[0]));
  }
  if (sql.includes('select * from users where stripe_subscription_id = $1')) {
    return result(store.users.filter((u) => u.stripe_subscription_id === params[0]));
  }
  if (sql.includes('from users where api_token = $1')) {
    return result(store.users.filter((u) => u.api_token === params[0]).map(publicUser));
  }
  if (sql.includes('from users where subdomain = $1')) {
    return result(store.users.filter((u) => u.subdomain === params[0]).map(publicUser));
  }
  if (sql.includes('select 1 from users where email = $1')) {
    const email = String(params[0] || '').toLowerCase().trim();
    return result(store.users.filter((u) => u.email === email).map(() => ({ '?column?': 1 })));
  }
  if (sql.includes('select 1 from users where subdomain = $1')) {
    return result(store.users.filter((u) => u.subdomain === params[0]).map(() => ({ '?column?': 1 })));
  }
  if (sql.startsWith('insert into users')) {
    const row = {
      id: store.nextUserId++,
      email: String(params[0] || '').toLowerCase().trim(),
      password_hash: params[1],
      subdomain: params[2],
      api_token: params[3],
      plan: params[4] || 'free',
      stripe_customer_id: null,
      stripe_subscription_id: null,
      created_at: new Date().toISOString(),
    };
    store.users.push(row);
    saveStore(store);
    return result([publicUser(row)], 1);
  }
  if (sql.startsWith('update users set password_hash = $1 where id = $2')) {
    const row = store.users.find((u) => u.id === Number(params[1]));
    if (row) row.password_hash = params[0];
    saveStore(store);
    return result([], row ? 1 : 0);
  }
  if (sql.includes('set stripe_customer_id = $2') && sql.includes('where id = $1')) {
    const row = store.users.find((u) => u.id === Number(params[0]));
    if (row) row.stripe_customer_id = params[1];
    saveStore(store);
    return result(row ? [row] : [], row ? 1 : 0);
  }
  if (sql.includes('where id = $1') && sql.includes('stripe_subscription_id = coalesce($4')) {
    const row = store.users.find((u) => u.id === Number(params[0]));
    if (row) {
      row.plan = params[1];
      row.stripe_customer_id = params[2] ?? row.stripe_customer_id;
      row.stripe_subscription_id = params[3] ?? row.stripe_subscription_id;
    }
    saveStore(store);
    return result(row ? [row] : [], row ? 1 : 0);
  }
  if (sql.includes('where stripe_customer_id = $1') && sql.includes('stripe_subscription_id = coalesce($3')) {
    const row = store.users.find((u) => u.stripe_customer_id === params[0]);
    if (row) {
      row.plan = params[1];
      row.stripe_subscription_id = params[2] ?? row.stripe_subscription_id;
    }
    saveStore(store);
    return result(row ? [row] : [], row ? 1 : 0);
  }
  if (sql.includes('where stripe_subscription_id = $1') && sql.includes('stripe_customer_id = coalesce($3')) {
    const row = store.users.find((u) => u.stripe_subscription_id === params[0]);
    if (row) {
      row.plan = params[1];
      row.stripe_customer_id = params[2] ?? row.stripe_customer_id;
    }
    saveStore(store);
    return result(row ? [row] : [], row ? 1 : 0);
  }
  if (sql.includes("set plan = 'free'") && sql.includes('where stripe_subscription_id = $1')) {
    const row = store.users.find((u) => u.stripe_subscription_id === params[0]);
    if (row) {
      row.plan = 'free';
      row.stripe_subscription_id = null;
    }
    saveStore(store);
    return result(row ? [row] : [], row ? 1 : 0);
  }
  if (sql.includes("set plan = 'free'") && sql.includes('where stripe_customer_id = $1')) {
    const row = store.users.find((u) => u.stripe_customer_id === params[0]);
    if (row) {
      row.plan = 'free';
      row.stripe_subscription_id = null;
    }
    saveStore(store);
    return result(row ? [row] : [], row ? 1 : 0);
  }

  if (sql.startsWith('insert into requests')) {
    const row = {
      id: store.nextRequestId++,
      user_id: Number(params[0]),
      subdomain: params[1],
      method: params[2],
      path: params[3],
      status_code: params[4],
      response_time_ms: params[5],
      request_headers: parseJson(params[6]),
      request_body: params[7],
      response_headers: parseJson(params[8]),
      response_body: params[9],
      created_at: new Date().toISOString(),
    };
    store.requests.unshift(row);
    store.requests = store.requests
      .filter((r, idx, all) => all.findIndex((x) => x.subdomain === r.subdomain && x.id === r.id) === idx)
      .slice(0, 500);
    saveStore(store);
    return result([], 1);
  }
  if (sql.includes('from requests') && sql.includes('where user_id = $1')) {
    const limit = Number(params[1] || 100);
    return result(store.requests
      .filter((r) => r.user_id === Number(params[0]))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit));
  }
  if (sql.includes('select * from requests where id = $1 and user_id = $2')) {
    return result(store.requests.filter((r) => r.id === Number(params[0]) && r.user_id === Number(params[1])));
  }

  throw new Error(`[DB:file] Unsupported query: ${text.slice(0, 120)}`);
}

const pool = USE_FILE_DB ? null : new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        // Enable SSL for cloud-hosted Postgres (e.g. Supabase, Railway, Heroku)
        // Set DATABASE_URL_SSL=false to disable in dev
        ssl: process.env.DATABASE_URL_SSL === 'false'
          ? false
          : process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1')
            ? false
            : { rejectUnauthorized: false },
      }
    : undefined  // falls back to PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD
);

// Log connection issues immediately
if (pool) {
  pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
  });
}

/**
 * Run a parameterised query.
 * @param {string} text    SQL string with $1, $2 … placeholders
 * @param {Array}  params  Parameter values
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  if (USE_FILE_DB) return fileQuery(text, params);

  const start  = Date.now();
  const result = await pool.query(text, params);
  const ms     = Date.now() - start;
  if (process.env.DB_QUERY_LOG === 'true') {
    console.log(`[DB] query (${ms}ms) rows=${result.rowCount} — ${text.slice(0, 80)}`);
  }
  return result;
}

/** Acquire a raw client for transactions. Remember to client.release(). */
async function getClient() {
  if (USE_FILE_DB) {
    throw new Error('[DB:file] Transactions are not supported by the file-backed dev database');
  }
  return pool.connect();
}

module.exports = { query, getClient, pool };
