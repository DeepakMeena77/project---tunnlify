'use strict';

/**
 * auth/routes.js
 * ──────────────
 * Express router for authentication endpoints.
 *
 *   POST /auth/signup  — create account
 *   POST /auth/login   — verify password, return JWT
 *   GET  /auth/me      — return user info (JWT required)
 */

const express = require('express');
const bcrypt  = require('bcryptjs');

const users  = require('../db/users');
const { signToken, generateApiToken, deriveSubdomain, resolveUniqueSubdomain } = require('./tokens');
const { requireAuth } = require('./middleware');
const { getPlanLimit } = require('../billing/plans');

const router = express.Router();

// bcrypt rounds — default 12, lower in test for speed
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

// ── Input validators ──────────────────────────────────────────────────────────

function isValidEmail(email) {
  // Simple but solid RFC-5321-ish check
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidPassword(pw) {
  return typeof pw === 'string' && pw.length >= 8;
}

// ── POST /auth/signup ─────────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const body = req.body;
    // req.body is a Buffer (raw middleware) when content-type isn't JSON.
    // Parse it safely.
    const payload = parseBody(body);

    const { email, password } = payload ?? {};

    // ── Validation ────────────────────────────────────────────────────────────
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'ValidationError', message: 'A valid email is required' });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'ValidationError', message: 'Password must be at least 8 characters' });
    }

    // ── Uniqueness check ──────────────────────────────────────────────────────
    if (await users.emailExists(email)) {
      return res.status(409).json({ error: 'Conflict', message: 'An account with that email already exists' });
    }

    // ── Hash & create ─────────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const apiToken     = generateApiToken();
    const baseSubdomain = deriveSubdomain(email);
    const subdomain    = await resolveUniqueSubdomain(baseSubdomain, users.subdomainExists);

    const user = await users.createUser({ email, passwordHash, subdomain, apiToken });

    // ── Respond ───────────────────────────────────────────────────────────────
    const token = signToken(user);
    console.log(`[auth] ✅ New account: ${email} → subdomain="${subdomain}"`);

    return res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        id:        user.id,
        email:     user.email,
        subdomain: user.subdomain,
        api_token: user.api_token,
        plan:      user.plan,
        plan_limit: getPlanLimit(user.plan),
        created_at: user.created_at,
      },
    });
  } catch (err) {
    console.error('[auth] Signup error:', err.message);
    return res.status(500).json({ error: 'InternalError', message: 'Signup failed — please try again' });
  }
});

// ── POST /auth/login ──────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const payload = parseBody(req.body);
    const { email, password } = payload ?? {};

    if (!email || !password) {
      return res.status(400).json({ error: 'ValidationError', message: 'email and password are required' });
    }

    // Look up user (needs password_hash so we use findByEmail)
    const user = await users.findByEmail(email);

    // Use a constant-time compare even on "not found" to prevent user enumeration
    const hashToCompare = user?.password_hash ?? '$2a$12$invalidhashpadding000000000000000000000000000000000000';
    const valid = await bcrypt.compare(password, hashToCompare);

    if (!user || !valid) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password' });
    }

    const token = signToken(user);
    console.log(`[auth] Login: ${email}`);

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id:        user.id,
        email:     user.email,
        subdomain: user.subdomain,
        api_token: user.api_token,
        plan:      user.plan,
        plan_limit: getPlanLimit(user.plan),
        created_at: user.created_at,
      },
    });
  } catch (err) {
    console.error('[auth] Login error:', err.message);
    return res.status(500).json({ error: 'InternalError', message: 'Login failed — please try again' });
  }
});

// ── GET /auth/me ──────────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await users.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'NotFound', message: 'User account not found' });
    }
    return res.json({
      id:        user.id,
      email:     user.email,
      subdomain: user.subdomain,
      api_token: user.api_token,
      plan:      user.plan,
      plan_limit: getPlanLimit(user.plan),
      created_at: user.created_at,
    });
  } catch (err) {
    console.error('[auth] /me error:', err.message);
    return res.status(500).json({ error: 'InternalError', message: 'Could not fetch user info' });
  }
});

// ── GET /auth/requests ────────────────────────────────────────────────────────
const { getRequestsForUser, getRequestById } = require('../db/requests');

router.get('/requests', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 100);
    const rows  = await getRequestsForUser(req.user.id, limit);
    return res.json(rows);
  } catch (err) {
    console.error('[auth] /requests error:', err.message);
    return res.status(500).json({ error: 'InternalError', message: 'Could not fetch requests' });
  }
});

// ── GET /auth/requests/:id ────────────────────────────────────────────────────
router.get('/requests/:id', requireAuth, async (req, res) => {
  try {
    const id  = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'BadRequest', message: 'Invalid id' });

    const row = await getRequestById(id, req.user.id);
    if (!row) return res.status(404).json({ error: 'NotFound', message: 'Request not found' });

    return res.json(row);
  } catch (err) {
    console.error('[auth] /requests/:id error:', err.message);
    return res.status(500).json({ error: 'InternalError', message: 'Could not fetch request' });
  }
});

// ── POST /auth/change-password ────────────────────────────────────────────────
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = parseBody(req.body);

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'ValidationError', message: 'currentPassword and newPassword are required' });
    }
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: 'ValidationError', message: 'New password must be at least 8 characters' });
    }

    const user = await users.findByEmail(req.user.email);
    if (!user) return res.status(404).json({ error: 'NotFound', message: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await users.updatePasswordHash(user.id, newHash);

    console.log(`[auth] Password changed: ${user.email}`);
    return res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('[auth] change-password error:', err.message);
    return res.status(500).json({ error: 'InternalError', message: 'Could not change password' });
  }
});



/**
 * Parse req.body safely.
 * express.raw() gives us a Buffer; JSON requests also pass through because of
 * the `type: '*\/*'` rule in server.js.  We handle both.
 */
function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'object' && !Buffer.isBuffer(body)) return body;
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    return {};
  }
}

module.exports = router;

