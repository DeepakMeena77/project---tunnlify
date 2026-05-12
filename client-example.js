'use strict';

/**
 * client-example.js
 * ------------------
 * Example tunnel CLIENT.  Run this on the machine that has your local service.
 * It connects to the tunnel server, registers a subdomain, then forwards every
 * proxied HTTP request to your local server and ships the response back.
 *
 * Usage:
 *   node client-example.js
 *
 * Requires:  npm install ws
 */

const WebSocket = require('ws');
const http      = require('http');

// ── Config ────────────────────────────────────────────────────────────────────
const TUNNEL_SERVER   = 'ws://localhost:3000';    // Tunnel server WS endpoint
const SUBDOMAIN       = 'john';                   // Subdomain to claim
const TOKEN           = 'abc';                    // Auth token
const LOCAL_HOST      = 'localhost';              // Your local service host
const LOCAL_PORT      = 8080;                     // Your local service port
const RECONNECT_MS    = 5_000;                    // Reconnect delay

// ── Connect ───────────────────────────────────────────────────────────────────
function connect() {
  console.log(`[Client] Connecting to ${TUNNEL_SERVER} …`);
  const ws = new WebSocket(TUNNEL_SERVER);

  ws.on('open', () => {
    console.log('[Client] Connected — registering subdomain …');
    ws.send(JSON.stringify({ type: 'register', subdomain: SUBDOMAIN, token: TOKEN }));
  });

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'registered') {
      console.log(`[Client] ✅ Tunnel active at ${msg.publicUrl}`);
      return;
    }

    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' }));
      return;
    }

    if (msg.type === 'error') {
      console.error('[Client] Server error:', msg.message);
      return;
    }

    if (msg.type === 'request') {
      const { requestId, method, path, headers, body, bodyBase64 } = msg;
      console.log(`[Client] → ${method} ${path} (id=${requestId})`);

      // Decode body
      const bodyBuf = body ? Buffer.from(body, bodyBase64 ? 'base64' : 'utf8') : null;

      // Forward to local service
      const localHeaders = { ...headers };
      // Replace the Host header so the local server doesn't see the tunnel domain
      localHeaders['host'] = `${LOCAL_HOST}:${LOCAL_PORT}`;

      try {
        const tunnelRes = await forwardRequest({ method, path, headers: localHeaders, body: bodyBuf });
        ws.send(JSON.stringify({
          type:       'response',
          requestId,
          status:     tunnelRes.status,
          headers:    tunnelRes.headers,
          body:       tunnelRes.body.toString('base64'),
          bodyBase64: true,
        }));
        console.log(`[Client] ← ${tunnelRes.status} ${method} ${path}`);
      } catch (err) {
        console.error(`[Client] Local forward error:`, err.message);
        ws.send(JSON.stringify({
          type:      'response',
          requestId,
          status:    502,
          headers:   { 'content-type': 'application/json' },
          body:      Buffer.from(JSON.stringify({ error: err.message })).toString('base64'),
          bodyBase64: true,
        }));
      }
    }
  });

  ws.on('close', () => {
    console.log(`[Client] Disconnected — reconnecting in ${RECONNECT_MS / 1000}s …`);
    setTimeout(connect, RECONNECT_MS);
  });

  ws.on('error', (err) => {
    console.error('[Client] WebSocket error:', err.message);
  });
}

// ── HTTP forwarder ────────────────────────────────────────────────────────────
function forwardRequest({ method, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: LOCAL_HOST,
      port:     LOCAL_PORT,
      path,
      method,
      headers,
    };

    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status:  res.statusCode,
        headers: res.headers,
        body:    Buffer.concat(chunks),
      }));
    });

    req.on('error', reject);

    if (body && body.length) req.write(body);
    req.end();
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
connect();
