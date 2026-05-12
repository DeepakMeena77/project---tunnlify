'use strict';

/**
 * auth/tokens.js
 * ──────────────
 * JWT signing/verification and random token/subdomain generation.
 */

const jwt    = require('jsonwebtoken');
const crypto = require('crypto');

// ── Config ────────────────────────────────────────────────────────────────────
function jwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s === 'change_me_to_a_long_random_string') {
    throw new Error(
      '[auth] JWT_SECRET is not set or is still the default placeholder.\n' +
      '       Run: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'
    );
  }
  return s;
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// ── JWT ───────────────────────────────────────────────────────────────────────

/**
 * Sign a JWT containing { sub: userId, email, subdomain }.
 * @param {object} payload  { id, email, subdomain }
 * @returns {string} signed JWT
 */
function signToken(payload) {
  return jwt.sign(
    { sub: payload.id, email: payload.email, subdomain: payload.subdomain },
    jwtSecret(),
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Verify and decode a JWT.
 * @param {string} token
 * @returns {{ sub: number, email: string, subdomain: string, iat: number, exp: number }}
 * @throws {JsonWebTokenError|TokenExpiredError}
 */
function verifyToken(token) {
  return jwt.verify(token, jwtSecret());
}

// ── Random values ─────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random API token.
 * Format: tun_<48 hex chars>  (64 bits of randomness)
 */
function generateApiToken() {
  return 'tun_' + crypto.randomBytes(24).toString('hex');
}

/**
 * Derive a URL-safe subdomain from an email address.
 * Falls back to a random suffix if the result collides (callers check uniqueness).
 *
 * alice@example.com  →  alice
 * bob.smith@acme.co  →  bobsmith
 * 123@test.com       →  user-<random>
 */
function deriveSubdomain(email) {
  const local = email.split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')   // strip everything except a-z, 0-9, hyphen
    .replace(/^-+|-+$/g, '')      // trim leading/trailing hyphens
    .slice(0, 32);                // max 32 chars

  if (!local || /^\d+$/.test(local)) {
    // All digits or empty — not a great subdomain, add random suffix
    return 'user-' + crypto.randomBytes(3).toString('hex');
  }
  return local;
}

/**
 * Resolve a unique subdomain, appending a random suffix if needed.
 * @param {string}   base        Preferred subdomain
 * @param {Function} existsFn    async (subdomain) => boolean
 * @param {number}   [maxTries]  Safety limit
 */
async function resolveUniqueSubdomain(base, existsFn, maxTries = 10) {
  let candidate = base;
  for (let i = 0; i < maxTries; i++) {
    if (!(await existsFn(candidate))) return candidate;
    candidate = base + '-' + crypto.randomBytes(2).toString('hex');
  }
  // Absolute fallback
  return base + '-' + crypto.randomBytes(4).toString('hex');
}

module.exports = {
  signToken,
  verifyToken,
  generateApiToken,
  deriveSubdomain,
  resolveUniqueSubdomain,
};
