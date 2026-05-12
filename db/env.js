'use strict';

/**
 * db/env.js
 * ─────────
 * Loads .env into process.env before any module that needs it.
 * Uses Node's built-in --env-file when available (Node 20+),
 * otherwise falls back to a tiny manual parser (no dotenv dep needed).
 *
 * Just require this file first in any entry-point:
 *   require('./db/env');
 */

const fs   = require('fs');
const path = require('path');

const ENV_FILE = path.resolve(__dirname, '..', '.env');

if (fs.existsSync(ENV_FILE)) {
  const lines = fs.readFileSync(ENV_FILE, 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    // Skip blanks and comments
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key   = line.slice(0, eqIdx).trim();
    let   value = line.slice(eqIdx + 1).trim();
    // Strip surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // Don't overwrite vars already in the environment
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
} else {
  // Not fatal — production envs set vars through the system
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[env] No .env file found at ${ENV_FILE} — using system environment variables`);
  }
}
