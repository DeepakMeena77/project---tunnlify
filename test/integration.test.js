'use strict';
/**
 * Integration smoke test — runs everything in-process.
 *
 * Starts:  echo-server (:9999) + tunnel-server (:3000) + tunnel-client
 * Then:    sends 3 HTTP requests through the tunnel
 * Finally: asserts correct responses and prints results
 */

const http    = require('http');
const { WebSocketServer } = require('ws');

// We load the modules directly rather than spawning child processes
// so we get proper stdout and reliable sequencing.

// ── 1. Inline echo server on :9999 ────────────────────────────────────────────
const echoServer = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString() || null;
    const payload = JSON.stringify({ method: req.method, path: req.url, body });
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) });
    res.end(payload);
  });
});

// ── 2. Tunnel server (inline, same logic as server.js) ────────────────────────
const express  = require('express');
const { WebSocket } = require('ws');

const app        = express();
const httpServer = http.createServer(app);
const wss        = new WebSocketServer({ server: httpServer });

const tunnels = new Map();
const pending = new Map();
let counter   = 0;

function nextId()  { return `req_${++counter}`; }
function wsSend(s, d) { if (s.readyState === WebSocket.OPEN) s.send(JSON.stringify(d)); }

app.use(express.raw({ type: '*/*', limit: '10mb' }));
app.all('*', async (req, res) => {
  const host      = (req.headers['host'] || '').split(':')[0];
  const subdomain = host.endsWith('.tunnels.com') ? host.slice(0, -('.tunnels.com'.length)) : null;
  if (!subdomain) return res.status(400).json({ error: 'bad host' });
  const sock = tunnels.get(subdomain);
  if (!sock || sock.readyState !== WebSocket.OPEN) return res.status(404).json({ error: 'no tunnel' });

  const requestId = nextId();
  wsSend(sock, {
    type: 'request', requestId,
    method: req.method, path: req.url,
    headers: req.headers,
    body: req.body?.length ? req.body.toString('base64') : null,
    bodyBase64: true,
  });

  const tunnelRes = await new Promise((resolve, reject) => {
    const t = setTimeout(() => { pending.delete(requestId); reject(new Error('timeout')); }, 5000);
    pending.set(requestId, { resolve, reject, timer: t });
  });

  res.status(tunnelRes.status || 200);
  Object.entries(tunnelRes.headers || {}).forEach(([k, v]) => {
    try { res.setHeader(k, v); } catch (_) {}
  });
  res.end(tunnelRes.bodyBase64 && tunnelRes.body ? Buffer.from(tunnelRes.body, 'base64') : (tunnelRes.body ?? ''));
});

wss.on('connection', (sock) => {
  sock._isAlive = true;
  sock.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'register') {
      sock._subdomain = msg.subdomain;
      tunnels.set(msg.subdomain, sock);
      wsSend(sock, { type: 'registered', subdomain: msg.subdomain, publicUrl: `http://${msg.subdomain}.tunnels.com:3000` });
    } else if (msg.type === 'response') {
      const e = pending.get(msg.requestId);
      if (e) { clearTimeout(e.timer); pending.delete(msg.requestId); e.resolve(msg); }
    } else if (msg.type === 'pong') {
      sock._isAlive = true;
    }
  });
  sock.on('close', () => { if (sock._subdomain) tunnels.delete(sock._subdomain); });
});

// ── 3. Tunnel client (inline) ─────────────────────────────────────────────────
const { forwardRequest } = require('../lib/forwarder');

function startClient() {
  const ws = new WebSocket('ws://localhost:3000');
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'register', subdomain: 'john', token: 'abc' }));
  });
  ws.on('message', async (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'ping') { ws.send(JSON.stringify({ type: 'pong' })); return; }
    if (msg.type === 'registered') { console.log('  [client] Tunnel registered:', msg.publicUrl); return; }
    if (msg.type === 'request') {
      const { requestId, method, path, headers, body: bodyB64 } = msg;
      const start = Date.now();
      try {
        const { status, headers: rh, body: rb } = await forwardRequest({
          port: 9999, method, path: path || '/',
          headers: headers || {},
          body: bodyB64 ? Buffer.from(bodyB64, 'base64') : null,
        });
        const ms = Date.now() - start;
        console.log(`  [client] ${method} ${path} ${status} ${ms}ms`);
        ws.send(JSON.stringify({ type: 'response', requestId, status, headers: rh, body: rb.toString('base64'), bodyBase64: true }));
      } catch (err) {
        ws.send(JSON.stringify({ type: 'response', requestId, status: 502, headers: {}, body: Buffer.from(err.message).toString('base64'), bodyBase64: true }));
      }
    }
  });
  ws.on('error', (e) => console.error('  [client] error:', e.message));
}

// ── 4. HTTP helper ─────────────────────────────────────────────────────────────
function httpGet(path) {
  return new Promise((resolve, reject) => {
    const r = http.request({ hostname: 'localhost', port: 3000, path, method: 'GET', headers: { host: 'john.tunnels.com' } }, (res) => {
      const cs = []; res.on('data', c => cs.push(c)); res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(cs).toString() }));
    });
    r.on('error', reject); r.end();
  });
}

// ── 5. Run ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n  ═══════════════════════════════════════════');
  console.log('    Tunnlify Integration Test');
  console.log('  ═══════════════════════════════════════════\n');

  // Start echo server
  await new Promise(r => echoServer.listen(9999, r));
  console.log('  [echo]   Listening on :9999');

  // Start tunnel server
  await new Promise(r => httpServer.listen(3000, r));
  console.log('  [server] Listening on :3000');

  // Start client and wait for registration
  await new Promise((resolve) => {
    const origSend = wss.emit.bind(wss);
    // Patch: detect 'registered' event via tunnels map polling
    startClient();
    const poll = setInterval(() => { if (tunnels.has('john')) { clearInterval(poll); resolve(); } }, 50);
  });
  console.log('  [test]   Tunnel active — running requests\n');

  let passed = 0;
  let failed = 0;

  async function test(label, fn) {
    try {
      await fn();
      console.log(`  ✔  ${label}`);
      passed++;
    } catch (e) {
      console.error(`  ✖  ${label}: ${e.message}`);
      failed++;
    }
  }

  await test('GET /api/users returns 200 with method+path', async () => {
    const { status, body } = await httpGet('/api/users');
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
    const json = JSON.parse(body);
    if (json.method !== 'GET') throw new Error(`Expected GET, got ${json.method}`);
    if (json.path !== '/api/users') throw new Error(`Expected /api/users, got ${json.path}`);
  });

  await test('GET /health returns 200', async () => {
    const { status } = await httpGet('/health');
    if (status !== 200) throw new Error(`Expected 200, got ${status}`);
  });

  await test('Unregistered subdomain returns 404', async () => {
    const res = await new Promise((resolve, reject) => {
      const r = http.request({ hostname: 'localhost', port: 3000, path: '/ping', method: 'GET', headers: { host: 'nobody.tunnels.com' } }, (res) => {
        const cs = []; res.on('data', c => cs.push(c)); res.on('end', () => resolve({ status: res.statusCode }));
      });
      r.on('error', reject); r.end();
    });
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });

  console.log('');
  console.log(`  ═══════════════════════════════════════════`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`  ═══════════════════════════════════════════\n`);

  echoServer.close();
  httpServer.close();
  wss.close();
  process.exit(failed > 0 ? 1 : 0);
})();
