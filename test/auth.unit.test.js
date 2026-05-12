'use strict';

/**
 * test/auth.unit.test.js
 * ──────────────────────
 * Unit tests for auth/tokens.js and auth/middleware.js.
 * No database or network required — everything is self-contained.
 */

// Inject a test JWT_SECRET before loading modules
process.env.JWT_SECRET = 'test_secret_that_is_long_enough_for_hs256_hmac_signing_yes_it_is';
process.env.JWT_EXPIRES_IN = '1h';

const assert = require('assert');
const { signToken, verifyToken, generateApiToken, deriveSubdomain, resolveUniqueSubdomain } = require('../auth/tokens');

let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  ✔  ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✖  ${label}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

async function testAsync(label, fn) {
  try {
    await fn();
    console.log(`  ✔  ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✖  ${label}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

console.log('\n  ═══════════════════════════════════════════');
console.log('    auth/tokens.js — Unit Tests');
console.log('  ═══════════════════════════════════════════\n');

// ── JWT sign + verify ─────────────────────────────────────────────────────────
test('signToken returns a non-empty string', () => {
  const tok = signToken({ id: 1, email: 'a@b.com', subdomain: 'alice' });
  assert.strictEqual(typeof tok, 'string');
  assert.ok(tok.length > 0);
});

test('verifyToken decodes correct payload', () => {
  const tok     = signToken({ id: 42, email: 'bob@example.com', subdomain: 'bob' });
  const decoded = verifyToken(tok);
  assert.strictEqual(decoded.sub, 42);
  assert.strictEqual(decoded.email, 'bob@example.com');
  assert.strictEqual(decoded.subdomain, 'bob');
});

test('verifyToken throws on tampered token', () => {
  const tok      = signToken({ id: 1, email: 'x@y.com', subdomain: 'x' });
  const tampered = tok.slice(0, -4) + 'XXXX';
  assert.throws(() => verifyToken(tampered), /invalid/i);
});

test('verifyToken throws on expired token', () => {
  const jwt = require('jsonwebtoken');
  const expired = jwt.sign(
    { sub: 1, email: 'e@e.com', subdomain: 'e' },
    process.env.JWT_SECRET,
    { expiresIn: -1 }   // immediately expired
  );
  assert.throws(() => verifyToken(expired), /expired/i);
});

// ── generateApiToken ──────────────────────────────────────────────────────────
test('generateApiToken starts with "tun_"', () => {
  const tok = generateApiToken();
  assert.ok(tok.startsWith('tun_'), `Got: ${tok}`);
});

test('generateApiToken is 52 chars long', () => {
  const tok = generateApiToken();
  assert.strictEqual(tok.length, 52); // 'tun_' (4) + 48 hex chars
});

test('generateApiToken produces unique values', () => {
  const tokens = new Set(Array.from({ length: 100 }, () => generateApiToken()));
  assert.strictEqual(tokens.size, 100, 'Expected 100 unique tokens');
});

// ── deriveSubdomain ───────────────────────────────────────────────────────────
test('deriveSubdomain strips @ and domain', () => {
  assert.strictEqual(deriveSubdomain('alice@example.com'), 'alice');
});

test('deriveSubdomain removes non-alphanumeric chars', () => {
  assert.strictEqual(deriveSubdomain('bob.smith@acme.co'), 'bobsmith');
});

test('deriveSubdomain handles all-numeric local part', () => {
  const sub = deriveSubdomain('123@test.com');
  assert.ok(sub.startsWith('user-'), `Got: ${sub}`);
});

test('deriveSubdomain truncates long local parts to 32 chars', () => {
  const sub = deriveSubdomain('averylongemailaddressthatexceedsthirtytwocharacters@example.com');
  assert.ok(sub.length <= 32, `Length was ${sub.length}`);
});

// ── resolveUniqueSubdomain (async — run inside IIFE below) ───────────────────
// ── middleware unit test (no express needed) ──────────────────────────────────

const { requireAuth } = require('../auth/middleware');

function mockRes() {
  const res = { _status: 200, _body: null };
  res.status = (s) => { res._status = s; return res; };
  res.json   = (b) => { res._body   = b; return res; };
  return res;
}

test('requireAuth calls next() with valid Bearer token', () => {
  const token = signToken({ id: 7, email: 'z@z.com', subdomain: 'z' });
  const req   = { headers: { authorization: `Bearer ${token}` } };
  const res   = mockRes();
  let nextCalled = false;
  requireAuth(req, res, () => { nextCalled = true; });
  assert.ok(nextCalled, 'next() was not called');
  assert.strictEqual(req.user.id, 7);
  assert.strictEqual(req.user.email, 'z@z.com');
});

test('requireAuth returns 401 when no header', () => {
  const req = { headers: {} };
  const res = mockRes();
  requireAuth(req, res, () => {});
  assert.strictEqual(res._status, 401);
});

test('requireAuth returns 401 for invalid token', () => {
  const req = { headers: { authorization: 'Bearer not.a.valid.jwt' } };
  const res = mockRes();
  requireAuth(req, res, () => {});
  assert.strictEqual(res._status, 401);
  assert.strictEqual(res._body.error, 'InvalidToken');
});

test('requireAuth returns 401 with TokenExpired for expired token', () => {
  const jwt     = require('jsonwebtoken');
  const expired = jwt.sign({ sub: 1, email: 'e@e.com', subdomain: 'e' }, process.env.JWT_SECRET, { expiresIn: -1 });
  const req     = { headers: { authorization: `Bearer ${expired}` } };
  const res     = mockRes();
  requireAuth(req, res, () => {});
  assert.strictEqual(res._status, 401);
  assert.strictEqual(res._body.error, 'TokenExpired');
});

// ── Async tests + summary ─────────────────────────────────────────────────────
(async () => {
  console.log('');
  console.log('  ─── auth/tokens.js (async) ───────────────────────');

  await testAsync('resolveUniqueSubdomain returns base when not taken', async () => {
    const sub = await resolveUniqueSubdomain('john', async () => false);
    assert.strictEqual(sub, 'john');
  });

  await testAsync('resolveUniqueSubdomain appends suffix when taken', async () => {
    let calls = 0;
    const sub = await resolveUniqueSubdomain('john', async () => calls++ < 3);
    assert.ok(sub.startsWith('john-'), `Got: ${sub}`);
  });

  console.log('');
  console.log(`  ═══════════════════════════════════════════`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`  ═══════════════════════════════════════════\n`);

  process.exit(failed > 0 ? 1 : 0);
})();

