#!/usr/bin/env node
'use strict';

/**
 * tunnel CLI
 * ----------
 * Usage:
 *   tunnel start --port 3000 --subdomain john --token abc [--server wss://yourserver.com]
 *   tunnel --help
 */

const { parseArgs }   = require('../lib/args');
const { printHelp }   = require('../lib/help');
const { startTunnel } = require('../lib/tunnel');

const args = parseArgs(process.argv.slice(2));

if (args.help || args.h || process.argv.slice(2).length === 0) {
  printHelp();
  process.exit(0);
}

const [command] = args._;

if (command !== 'start') {
  console.error(`\n  ✖  Unknown command: "${command}". Run "tunnel --help" for usage.\n`);
  process.exit(1);
}

// ── Validate required flags ────────────────────────────────────────────────────
const missing = ['port', 'subdomain', 'token'].filter((k) => !args[k]);
if (missing.length) {
  console.error(`\n  ✖  Missing required flag(s): ${missing.map((f) => '--' + f).join(', ')}\n`);
  console.error('  Run "tunnel --help" for usage.\n');
  process.exit(1);
}

const port      = Number(args.port);
const subdomain = String(args.subdomain);
const token     = String(args.token);
const server    = String(args.server || 'wss://yourserver.com');

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`\n  ✖  --port must be a valid port number (1–65535), got: ${args.port}\n`);
  process.exit(1);
}

startTunnel({ port, subdomain, token, server });
