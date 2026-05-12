'use strict';

/**
 * db/users.js
 * ───────────
 * Data-access layer for the `users` table.
 * All SQL lives here — auth routes and WS handler import from this module.
 */

const { query } = require('./pool');

// Columns safe to return to the client (never password_hash)
const PUBLIC_COLS = 'id, email, subdomain, api_token, plan, created_at';

// ── Read ───────────────────────────────────────────────────────────────────────

/** Find user by primary key. Returns full row including password_hash. */
async function findById(id) {
  const { rows } = await query(
    `SELECT * FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

/** Find user by email (for login). Returns full row including password_hash. */
async function findByEmail(email) {
  const { rows } = await query(
    `SELECT * FROM users WHERE email = $1`,
    [email.toLowerCase().trim()]
  );
  return rows[0] ?? null;
}

/**
 * Find user by api_token.
 * Called on every WebSocket registration — must be fast (indexed).
 * Returns only public columns (no password_hash).
 */
async function findByToken(apiToken) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLS} FROM users WHERE api_token = $1`,
    [apiToken]
  );
  return rows[0] ?? null;
}

/** Find user by subdomain. Returns only public columns. */
async function findBySubdomain(subdomain) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLS} FROM users WHERE subdomain = $1`,
    [subdomain]
  );
  return rows[0] ?? null;
}

/** Find user by Stripe customer id. Returns full row. */
async function findByStripeCustomerId(stripeCustomerId) {
  const { rows } = await query(
    `SELECT * FROM users WHERE stripe_customer_id = $1`,
    [stripeCustomerId]
  );
  return rows[0] ?? null;
}

/** Find user by Stripe subscription id. Returns full row. */
async function findByStripeSubscriptionId(stripeSubscriptionId) {
  const { rows } = await query(
    `SELECT * FROM users WHERE stripe_subscription_id = $1`,
    [stripeSubscriptionId]
  );
  return rows[0] ?? null;
}

/** Check if email is already registered. */
async function emailExists(email) {
  const { rows } = await query(
    `SELECT 1 FROM users WHERE email = $1`,
    [email.toLowerCase().trim()]
  );
  return rows.length > 0;
}

/** Check if subdomain is already taken. */
async function subdomainExists(subdomain) {
  const { rows } = await query(
    `SELECT 1 FROM users WHERE subdomain = $1`,
    [subdomain]
  );
  return rows.length > 0;
}

// ── Write ──────────────────────────────────────────────────────────────────────

/**
 * Insert a new user.
 * @param {object} data
 * @param {string} data.email
 * @param {string} data.passwordHash  Already hashed with bcrypt
 * @param {string} data.subdomain
 * @param {string} data.apiToken
 * @param {string} [data.plan='free']
 * @returns {object} Newly created row (public columns only)
 */
async function createUser({ email, passwordHash, subdomain, apiToken, plan = 'free' }) {
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, subdomain, api_token, plan)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PUBLIC_COLS}`,
    [email.toLowerCase().trim(), passwordHash, subdomain, apiToken, plan]
  );
  return rows[0];
}

/** Update a user's password hash in place. */
async function updatePasswordHash(id, newHash) {
  await query(
    `UPDATE users SET password_hash = $1 WHERE id = $2`,
    [newHash, id]
  );
}

/** Persist the Stripe customer id created for a user. */
async function updateStripeCustomerId(id, stripeCustomerId) {
  const { rows } = await query(
    `UPDATE users
     SET stripe_customer_id = $2
     WHERE id = $1
     RETURNING *`,
    [id, stripeCustomerId]
  );
  return rows[0] ?? null;
}

/** Update billing state after Stripe confirms an active subscription. */
async function updateBillingByUserId({ id, plan, stripeCustomerId, stripeSubscriptionId }) {
  const { rows } = await query(
    `UPDATE users
     SET plan = $2,
         stripe_customer_id = COALESCE($3, stripe_customer_id),
         stripe_subscription_id = COALESCE($4, stripe_subscription_id)
     WHERE id = $1
     RETURNING *`,
    [id, plan, stripeCustomerId ?? null, stripeSubscriptionId ?? null]
  );
  return rows[0] ?? null;
}

/** Update billing state by Stripe customer id. */
async function updateBillingByStripeCustomerId({ stripeCustomerId, plan, stripeSubscriptionId }) {
  const { rows } = await query(
    `UPDATE users
     SET plan = $2,
         stripe_subscription_id = COALESCE($3, stripe_subscription_id)
     WHERE stripe_customer_id = $1
     RETURNING *`,
    [stripeCustomerId, plan, stripeSubscriptionId ?? null]
  );
  return rows[0] ?? null;
}

/** Update billing state by Stripe subscription id. */
async function updateBillingByStripeSubscriptionId({ stripeSubscriptionId, plan, stripeCustomerId }) {
  const { rows } = await query(
    `UPDATE users
     SET plan = $2,
         stripe_customer_id = COALESCE($3, stripe_customer_id)
     WHERE stripe_subscription_id = $1
     RETURNING *`,
    [stripeSubscriptionId, plan, stripeCustomerId ?? null]
  );
  return rows[0] ?? null;
}

/** Downgrade a user after Stripe reports a subscription cancellation. */
async function clearBillingByStripeSubscriptionId(stripeSubscriptionId) {
  const { rows } = await query(
    `UPDATE users
     SET plan = 'free',
         stripe_subscription_id = NULL
     WHERE stripe_subscription_id = $1
     RETURNING *`,
    [stripeSubscriptionId]
  );
  return rows[0] ?? null;
}

/** Downgrade a user by customer id when the subscription id is unavailable. */
async function clearBillingByStripeCustomerId(stripeCustomerId) {
  const { rows } = await query(
    `UPDATE users
     SET plan = 'free',
         stripe_subscription_id = NULL
     WHERE stripe_customer_id = $1
     RETURNING *`,
    [stripeCustomerId]
  );
  return rows[0] ?? null;
}

module.exports = {
  findById,
  findByEmail,
  findByToken,
  findBySubdomain,
  findByStripeCustomerId,
  findByStripeSubscriptionId,
  emailExists,
  subdomainExists,
  createUser,
  updatePasswordHash,
  updateStripeCustomerId,
  updateBillingByUserId,
  updateBillingByStripeCustomerId,
  updateBillingByStripeSubscriptionId,
  clearBillingByStripeSubscriptionId,
  clearBillingByStripeCustomerId,
};
