'use strict';

// ── Load environment variables first ──────────────────────────────────────────
require('./db/env');

const express = require('express');
const http    = require('http');
const { WebSocketServer } = require('ws');

const authRouter       = require('./auth/routes');
const { findByToken, findBySubdomain } = require('./db/users');
const { createBillingRouter } = require('./billing/routes');
const { getPlanLimit } = require('./billing/plans');
const { migrate }      = require('./db/migrate');
const { insertRequest } = require('./db/requests');

// ─── Config ───────────────────────────────────────────────────────────────────
const HTTP_PORT       = parseInt(process.env.PORT || process.env.HTTP_PORT || '3000', 10);
const TUNNEL_DOMAIN   = process.env.TUNNEL_DOMAIN || 'tunnels.com';
const PUBLIC_TUNNEL_PROTOCOL = process.env.PUBLIC_TUNNEL_PROTOCOL ||
  (process.env.NODE_ENV === 'production' ? 'https' : 'http');
const PUBLIC_TUNNEL_PORT = process.env.PUBLIC_TUNNEL_PORT ??
  (process.env.PORT ? '' : String(HTTP_PORT));
const TUNNEL_URL_MODE = process.env.TUNNEL_URL_MODE === 'path' ? 'path' : 'subdomain';
const PUBLIC_TUNNEL_BASE_URL = String(
  process.env.PUBLIC_TUNNEL_BASE_URL ||
  `${PUBLIC_TUNNEL_PROTOCOL}://${TUNNEL_DOMAIN}${PUBLIC_TUNNEL_PORT ? `:${PUBLIC_TUNNEL_PORT}` : ''}`
).replace(/\/$/, '');
const HEARTBEAT_MS    = 30_000;   // 30 s ping interval
const REQUEST_TIMEOUT = 30_000;   // 30 s max wait for tunnel reply
const CORS_ORIGINS    = parseOriginList(
  process.env.CORS_ORIGIN || process.env.FRONTEND_URL || process.env.APP_URL
);

// ─── State ────────────────────────────────────────────────────────────────────
/**
 * tunnels  Map<subdomain, WebSocket>
 * pending  Map<requestId, { resolve, reject, timer }>
 */
const tunnels = new Map();
const pending = new Map();

let requestCounter = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract subdomain from a Host header like "john.tunnels.com" */
function extractSubdomain(host = '') {
  const hostname = host.split(':')[0].toLowerCase();
  const suffix   = '.' + TUNNEL_DOMAIN;
  if (hostname.endsWith(suffix)) {
    return hostname.slice(0, hostname.length - suffix.length);
  }
  return null;
}

function extractPathTunnel(reqUrl = '') {
  const url = new URL(reqUrl, 'http://tunnlify.local');
  const match = url.pathname.match(/^\/t\/([^/]+)(\/.*)?$/);
  if (!match) return null;

  const subdomain = decodeURIComponent(match[1]).toLowerCase();
  const forwardedPath = `${match[2] || '/'}${url.search}`;
  return { subdomain, path: forwardedPath, mode: 'path' };
}

function resolveTunnelRoute(req) {
  const hostSubdomain = extractSubdomain(req.headers.host || '');
  if (hostSubdomain) {
    return { subdomain: hostSubdomain, path: req.url, mode: 'subdomain' };
  }

  return extractPathTunnel(req.url);
}

/** Generate a short unique ID for pending request correlation */
function nextRequestId() {
  requestCounter = (requestCounter + 1) % 1_000_000;
  return `req_${Date.now()}_${requestCounter}`;
}

function countActiveTunnelsForUser(userId) {
  let count = 0;
  for (const socket of tunnels.values()) {
    if (socket._userId === userId && socket.readyState === socket.OPEN) count++;
  }
  return count;
}

function isValidSubdomain(value) {
  return typeof value === 'string' &&
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
}

function parseOriginList(value = '') {
  return String(value)
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function isAllowedCorsOrigin(origin) {
  if (!origin) return false;
  const normalized = origin.replace(/\/$/, '');
  if (CORS_ORIGINS.includes('*') || CORS_ORIGINS.includes(normalized)) return true;

  return process.env.NODE_ENV !== 'production' &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized);
}

function publicTunnelUrl(subdomain) {
  if (TUNNEL_URL_MODE === 'path') {
    return `${PUBLIC_TUNNEL_BASE_URL}/t/${encodeURIComponent(subdomain)}`;
  }

  const port = PUBLIC_TUNNEL_PORT ? `:${PUBLIC_TUNNEL_PORT}` : '';
  return `${PUBLIC_TUNNEL_PROTOCOL}://${subdomain}.${TUNNEL_DOMAIN}${port}`;
}

/** Safely send JSON over a WebSocket (no-op if not OPEN) */
function wsSend(socket, data) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

// ─── Express app ─────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isAllowedCorsOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      req.headers['access-control-request-headers'] || 'Content-Type, Authorization, Stripe-Signature'
    );
    res.vary('Origin');
  }

  if (req.method === 'OPTIONS' && origin && req.headers['access-control-request-method']) {
    return res.sendStatus(204);
  }

  return next();
});

// Read raw body as a Buffer so we can forward tunnel traffic accurately.
// Auth routes parse this Buffer themselves (see auth/routes.js → parseBody).
app.use(express.raw({ type: '*/*', limit: '10mb' }));

// ── Auth routes (mounted BEFORE the tunnel catch-all) ────────────────────────
// These must come first so Host-header routing doesn't swallow them.
app.use('/auth', authRouter);
app.use('/billing', createBillingRouter({ getTunnelUsage: countActiveTunnelsForUser }));

// ── Health / status ───────────────────────────────────────────────────────────
app.get('/status', (req, res) => {
  res.json({
    status:  'ok',
    tunnels: tunnels.size,
    uptime:  Math.floor(process.uptime()),
  });
});

// ── Tunnel catch-all ──────────────────────────────────────────────────────────

/**
 * Record a proxied request to the DB (fire-and-forget).
 * @param {object} tunnelSocket  The registered WebSocket (has _userId, _subdomain)
 */
function recordRequest({ tunnelSocket, req, path, startMs, status, resHeaders, resBodyBuf, errMsg }) {
  if (!tunnelSocket || !tunnelSocket._userId) return;
  const responseTimeMs = Date.now() - startMs;

  const reqBodyStr = req.body && req.body.length
    ? req.body.toString('utf8').slice(0, 512)
    : null;
  const resBodyStr = resBodyBuf
    ? resBodyBuf.toString('utf8').slice(0, 512)
    : (errMsg ?? null);

  insertRequest({
    userId:          tunnelSocket._userId,
    subdomain:       tunnelSocket._subdomain,
    method:          req.method,
    path:            path || req.url,
    statusCode:      status,
    responseTimeMs,
    requestHeaders:  req.headers,
    requestBody:     reqBodyStr,
    responseHeaders: resHeaders ?? null,
    responseBody:    resBodyStr,
  }).catch(err => console.error('[DB] insertRequest failed:', err.message));
}

// Proxy every other HTTP request through the matching WebSocket tunnel.
app.all('*', async (req, res) => {
  const host      = req.headers['host'] || '';
  const route     = resolveTunnelRoute(req);
  const subdomain = route?.subdomain;

  if (!subdomain) {
    return res.status(400).json({
      error: 'Bad Request',
      message: `Expected <subdomain>.${TUNNEL_DOMAIN} or /t/<subdomain>`,
    });
  }

  if (!isValidSubdomain(subdomain)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid subdomain. Use lowercase letters, numbers, and hyphens only',
    });
  }

  const socket = tunnels.get(subdomain);
  if (!socket || socket.readyState !== socket.OPEN) {
    console.warn(`[HTTP] No active tunnel for "${subdomain}" (host: ${host})`);
    return res.status(404).json({
      error:   'Not Found',
      message: `No tunnel registered for subdomain "${subdomain}"`,
    });
  }

  const requestId = nextRequestId();

  const payload = {
    type:       'request',
    requestId,
    method:     req.method,
    path:       route.path,
    headers:    req.headers,
    body:       req.body && req.body.length ? req.body.toString('base64') : null,
    bodyBase64: true,
  };

  console.log(`[HTTP → WS] ${req.method} ${route.path} | subdomain="${subdomain}" | mode=${route.mode} | id=${requestId}`);

  const responsePromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error('Tunnel response timeout'));
    }, REQUEST_TIMEOUT);

    pending.set(requestId, { resolve, reject, timer });
  });

  // ── Record in DB (fire-and-forget — never blocks the HTTP response) ──────

  const startMs = Date.now();

  wsSend(socket, payload);

  try {
    const tunnelRes = await responsePromise;

    const status  = tunnelRes.status  || 200;
    const headers = tunnelRes.headers || {};

    const HOP_BY_HOP = new Set([
      'connection', 'keep-alive', 'transfer-encoding', 'te',
      'trailer', 'upgrade', 'proxy-authorization', 'proxy-authenticate',
    ]);
    Object.entries(headers).forEach(([k, v]) => {
      if (!HOP_BY_HOP.has(k.toLowerCase())) {
        try { res.setHeader(k, v); } catch (_) {}
      }
    });

    res.status(status);

    let responseBody = null;
    if (tunnelRes.bodyBase64 && tunnelRes.body) {
      responseBody = Buffer.from(tunnelRes.body, 'base64');
      res.end(responseBody);
    } else {
      responseBody = tunnelRes.body ?? '';
      res.end(responseBody);
    }

    console.log(`[WS → HTTP] ${status} ${req.method} ${route.path} | id=${requestId}`);
    recordRequest({ tunnelSocket: socket, req, path: route.path, startMs, status, resHeaders: headers,
      resBodyBuf: Buffer.isBuffer(responseBody) ? responseBody : Buffer.from(responseBody) });
  } catch (err) {
    console.error(`[HTTP] Error for ${requestId}:`, err.message);
    res.status(502).json({ error: 'Bad Gateway', message: err.message });
    recordRequest({ tunnelSocket: socket, req, path: route.path, startMs, status: 502, errMsg: err.message });
  }
});

// ─── WebSocket server ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

wss.on('connection', (socket, req) => {
  const remoteAddr = req.socket.remoteAddress;
  console.log(`[WS] New connection from ${remoteAddr} — awaiting registration`);

  socket._subdomain = null;
  socket._isAlive   = true;
  socket._userId    = null;

  // ── Message handler ──────────────────────────────────────────────────────
  socket.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      console.warn('[WS] Received non-JSON message — ignoring');
      return;
    }

    // ── register ─────────────────────────────────────────────────────────
    if (msg.type === 'register') {
      const { subdomain, token } = msg;

      // ── Basic shape validation ───────────────────────────────────────
      if (!token || typeof token !== 'string') {
        wsSend(socket, { type: 'error', message: 'Missing or invalid api_token' });
        return;
      }

      // ── Validate api_token against the database ──────────────────────
      let user;
      try {
        user = await findByToken(token);
      } catch (dbErr) {
        console.error('[WS] DB error during token validation:', dbErr.message);
        wsSend(socket, { type: 'error', message: 'Authentication service unavailable — try again' });
        return;
      }

      if (!user) {
        console.warn(`[WS] Invalid api_token from ${remoteAddr} — rejecting`);
        wsSend(socket, { type: 'error', message: 'Invalid api_token — check your credentials' });
        socket.terminate();
        return;
      }

      // ── Subdomain availability and plan limit checks ─────────────────
      // Users may use their assigned subdomain or an unassigned subdomain,
      // but they cannot claim another user's reserved subdomain.
      const requestedSubdomain = String(subdomain || user.subdomain).trim().toLowerCase();
      if (!isValidSubdomain(requestedSubdomain)) {
        wsSend(socket, {
          type: 'error',
          message: 'Invalid subdomain. Use lowercase letters, numbers, and hyphens only',
        });
        socket.terminate();
        return;
      }

      let owner;
      try {
        owner = await findBySubdomain(requestedSubdomain);
      } catch (dbErr) {
        console.error('[WS] DB error during subdomain ownership check:', dbErr.message);
        wsSend(socket, { type: 'error', message: 'Authentication service unavailable — try again' });
        return;
      }

      if (owner && owner.id !== user.id) {
        console.warn(`[WS] Subdomain "${requestedSubdomain}" belongs to another user`);
        wsSend(socket, {
          type: 'error',
          message: `Subdomain "${requestedSubdomain}" is not available`,
        });
        socket.terminate();
        return;
      }

      const claimedSubdomain = requestedSubdomain;

      const existing = tunnels.get(claimedSubdomain);
      const replacingOwnTunnel = existing && existing._userId === user.id;

      if (existing && existing._userId !== user.id) {
        wsSend(socket, {
          type: 'error',
          message: `Subdomain "${claimedSubdomain}" is already active`,
        });
        socket.terminate();
        return;
      }

      const planLimit = getPlanLimit(user.plan);
      const activeTunnels = countActiveTunnelsForUser(user.id);
      if (!replacingOwnTunnel && activeTunnels >= planLimit) {
        console.warn(`[WS] Tunnel limit reached for user=${user.email} plan=${user.plan} limit=${planLimit}`);
        wsSend(socket, {
          type: 'error',
          error: 'TunnelLimitReached',
          message: `Your ${user.plan || 'free'} plan allows ${planLimit} active tunnel${planLimit === 1 ? '' : 's'}. Upgrade to add more.`,
          plan: user.plan || 'free',
          tunnel_limit: planLimit,
          active_tunnels: activeTunnels,
        });
        socket.terminate();
        return;
      }

      if (socket._subdomain && socket._subdomain !== claimedSubdomain && tunnels.get(socket._subdomain) === socket) {
        tunnels.delete(socket._subdomain);
      }

      if (existing && existing !== socket) {
        console.log(`[WS] Replacing existing tunnel for "${claimedSubdomain}"`);
        existing.terminate();
      }

      socket._subdomain = claimedSubdomain;
      socket._userId    = user.id;
      socket._plan      = user.plan || 'free';
      tunnels.set(claimedSubdomain, socket);

      console.log(`[WS] ✅ Tunnel registered: "${claimedSubdomain}" (user=${user.email}) from ${remoteAddr}`);

      wsSend(socket, {
        type:      'registered',
        subdomain: claimedSubdomain,
        publicUrl: publicTunnelUrl(claimedSubdomain),
        plan:      user.plan,
        tunnel_limit: planLimit,
        active_tunnels: replacingOwnTunnel ? activeTunnels : activeTunnels + 1,
      });
      return;
    }

    // ── response (tunnel client replying to a proxied HTTP request) ────
    if (msg.type === 'response') {
      const { requestId } = msg;
      const entry = pending.get(requestId);
      if (!entry) {
        console.warn(`[WS] Response for unknown/expired requestId "${requestId}" — discarding`);
        return;
      }
      clearTimeout(entry.timer);
      pending.delete(requestId);
      entry.resolve(msg);
      return;
    }

    // ── pong (application-level) ──────────────────────────────────────
    if (msg.type === 'pong') {
      socket._isAlive = true;
      return;
    }

    console.warn(`[WS] Unknown message type "${msg.type}" — ignoring`);
  });

  // ── RFC 6455 protocol-level pong ────────────────────────────────────────
  socket.on('pong', () => {
    socket._isAlive = true;
  });

  // ── Close ────────────────────────────────────────────────────────────────
  socket.on('close', (code) => {
    const sub = socket._subdomain;
    if (sub && tunnels.get(sub) === socket) {
      tunnels.delete(sub);
      console.log(`[WS] ❌ Tunnel disconnected: "${sub}" (code=${code})`);
    } else {
      console.log(`[WS] Connection closed (unregistered, code=${code})`);
    }
  });

  // ── Error ────────────────────────────────────────────────────────────────
  socket.on('error', (err) => {
    console.error(`[WS] Socket error (${socket._subdomain ?? 'unregistered'}):`, err.message);
  });
});

// ─── Heartbeat (ping every 30 s) ─────────────────────────────────────────────
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((socket) => {
    if (!socket._isAlive) {
      const sub = socket._subdomain;
      console.log(`[Heartbeat] No pong from "${sub ?? 'unregistered'}" — terminating`);
      if (sub) tunnels.delete(sub);
      return socket.terminate();
    }
    socket._isAlive = false;
    socket.ping();
    wsSend(socket, { type: 'ping' });
  });
}, HEARTBEAT_MS);

server.on('close', () => clearInterval(heartbeatInterval));

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function start() {
  // Run DB migrations before accepting traffic
  try {
    await migrate();
  } catch (err) {
    console.error('[startup] ✖ Database migration failed:', err.message);
    console.error('[startup]   Is PostgreSQL running and DATABASE_URL configured?');
    process.exit(1);
  }

  server.listen(HTTP_PORT, () => {
    console.log('');
    console.log('┌──────────────────────────────────────────────────┐');
    console.log('│          Tunnlify  —  Tunnel Server               │');
    console.log('├──────────────────────────────────────────────────┤');
    console.log(`│  HTTP   →  http://localhost:${HTTP_PORT}                  │`);
    console.log(`│  WS     →  ws://localhost:${HTTP_PORT}                    │`);
    console.log(`│  Tunnel →  ${publicTunnelUrl('<subdomain>')}          │`);
    console.log('├──────────────────────────────────────────────────┤');
    console.log('│  Auth   →  POST /auth/signup                      │');
    console.log('│            POST /auth/login                       │');
    console.log('│            GET  /auth/me                          │');
    console.log('└──────────────────────────────────────────────────┘');
    console.log('');
  });
}

start();
