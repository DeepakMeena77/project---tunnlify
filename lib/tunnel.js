'use strict';

const WebSocket       = require('ws');
const { forwardRequest } = require('./forwarder');
const log             = require('./logger');

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_RECONNECT_DELAY_MS = 30_000;  // cap back-off at 30 s
const INITIAL_RECONNECT_MS   = 1_000;   // start at 1 s
const PONG_TIMEOUT_MS        = 10_000;  // kill socket if no pong in 10 s

/**
 * Start the tunnel client.
 *
 * @param {object} opts
 * @param {number}  opts.port       Local port to expose
 * @param {string}  opts.subdomain  Subdomain to register
 * @param {string}  opts.token      Auth token
 * @param {string}  opts.server     Tunnel server WebSocket URL
 */
function startTunnel({ port, subdomain, token, server }) {
  let reconnectDelay = INITIAL_RECONNECT_MS;
  let stopped        = false;

  function connect() {
    if (stopped) return;

    log.info(`Connecting to ${server} …`);

    const ws = new WebSocket(server);

    // Per-connection state
    let registered    = false;
    let pongTimer     = null;

    // ── Open ───────────────────────────────────────────────────────────────
    ws.on('open', () => {
      reconnectDelay = INITIAL_RECONNECT_MS; // reset back-off on success

      log.info(`Connected — registering subdomain "${subdomain}" …`);

      send({ type: 'register', subdomain, token });
    });

    // ── Messages ───────────────────────────────────────────────────────────
    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        log.warn('Received non-JSON message — ignoring');
        return;
      }

      // ── registered ──────────────────────────────────────────────────────
      if (msg.type === 'registered') {
        registered = true;
        log.banner(subdomain, msg.publicUrl || `${subdomain}.tunnels.com`, port);
        return;
      }

      // ── server-side ping (application level) ────────────────────────────
      if (msg.type === 'ping') {
        send({ type: 'pong' });
        return;
      }

      // ── error from server ────────────────────────────────────────────────
      if (msg.type === 'error') {
        log.error(`Server error: ${msg.message}`);
        return;
      }

      // ── proxied HTTP request ─────────────────────────────────────────────
      if (msg.type === 'request') {
        await handleRequest(msg);
        return;
      }

      log.warn(`Unknown message type "${msg.type}" — ignoring`);
    });

    // ── Protocol-level pong ────────────────────────────────────────────────
    ws.on('pong', () => {
      clearTimeout(pongTimer);
    });

    // ── Close ──────────────────────────────────────────────────────────────
    ws.on('close', (code, reason) => {
      clearTimeout(pongTimer);
      if (stopped) return;

      const reasonStr = reason?.toString() || 'unknown';
      log.warn(`Disconnected (code=${code}, reason=${reasonStr})`);
      scheduleReconnect();
    });

    // ── Error ──────────────────────────────────────────────────────────────
    ws.on('error', (err) => {
      log.error(`WebSocket error: ${err.message}`);
      // 'close' will fire next, triggering reconnect
    });

    // ── Heartbeat (RFC-6455 ping every 20 s) ──────────────────────────────
    const heartbeat = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;

      ws.ping();

      // If no pong arrives in PONG_TIMEOUT_MS, assume the connection is dead
      pongTimer = setTimeout(() => {
        log.warn('Heartbeat timeout — terminating connection');
        ws.terminate();
      }, PONG_TIMEOUT_MS);
    }, 20_000);

    ws.on('close', () => clearInterval(heartbeat));

    // ── Helpers scoped to this connection ─────────────────────────────────
    function send(data) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      }
    }

    /**
     * Handle a proxied HTTP request from the server.
     * Forwards to localhost:<port>, then sends the response back.
     */
    async function handleRequest(msg) {
      const { requestId, method, path, headers, body: bodyB64, bodyBase64 } = msg;
      const start = Date.now();

      // Decode body (may be null/empty)
      const bodyBuf = bodyB64
        ? Buffer.from(bodyB64, bodyBase64 !== false ? 'base64' : 'utf8')
        : null;

      let status, resHeaders, resBody;

      try {
        ({ status, headers: resHeaders, body: resBody } = await forwardRequest({
          port,
          method,
          path: path || '/',
          headers: headers || {},
          body: bodyBuf,
        }));
      } catch (err) {
        status     = 502;
        resHeaders = { 'content-type': 'application/json' };
        resBody    = Buffer.from(
          JSON.stringify({ error: `Local service error: ${err.message}` })
        );
        log.error(`Could not reach localhost:${port} — is your server running?`);
      }

      const elapsed = Date.now() - start;
      log.logRequest(method, path || '/', status, elapsed);

      // Ship response back through the WebSocket
      send({
        type:       'response',
        requestId,
        status,
        headers:    resHeaders,
        body:       resBody.toString('base64'),
        bodyBase64: true,
      });
    }
  }

  // ── Exponential back-off reconnect ─────────────────────────────────────────
  function scheduleReconnect() {
    log.info(`Reconnecting in ${(reconnectDelay / 1000).toFixed(1)}s …`);
    setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
      connect();
    }, reconnectDelay);
  }

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  function shutdown(sig) {
    console.log('');
    log.info(`Received ${sig} — shutting down`);
    stopped = true;
    process.exit(0);
  }

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  connect();
}

module.exports = { startTunnel };
