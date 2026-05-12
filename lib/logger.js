'use strict';

/**
 * Pretty terminal logger for the tunnel CLI.
 *
 * Colour codes (ANSI):
 *   method  → bold cyan
 *   path    → white
 *   status  → green / yellow / red based on HTTP class
 *   timing  → grey
 *   info    → dim white prefix
 *   error   → red
 */

const R     = '\x1b[0m';   // reset
const BOLD  = '\x1b[1m';
const DIM   = '\x1b[2m';
const CYAN  = '\x1b[36m';
const WHITE = '\x1b[97m';
const GRAY  = '\x1b[90m';
const GREEN = '\x1b[32m';
const YELL  = '\x1b[33m';
const RED   = '\x1b[31m';
const BLUE  = '\x1b[34m';

function statusColor(code) {
  if (code >= 500) return RED;
  if (code >= 400) return YELL;
  if (code >= 300) return BLUE;
  return GREEN;
}

/** "GET /api/users 200 34ms" */
function logRequest(method, path, statusCode, elapsedMs) {
  const m   = `${BOLD}${CYAN}${method.padEnd(7)}${R}`;
  const p   = `${WHITE}${path}${R}`;
  const s   = `${BOLD}${statusColor(statusCode)}${statusCode}${R}`;
  const t   = `${GRAY}${elapsedMs}ms${R}`;
  console.log(`  ${m} ${p} ${s} ${t}`);
}

function info(msg) {
  console.log(`${DIM}  ℹ  ${msg}${R}`);
}

function success(msg) {
  console.log(`${GREEN}  ✔  ${msg}${R}`);
}

function warn(msg) {
  console.warn(`${YELL}  ⚠  ${msg}${R}`);
}

function error(msg) {
  console.error(`${RED}  ✖  ${msg}${R}`);
}

function banner(subdomain, publicUrl, localPort) {
  const line = '─'.repeat(48);
  console.log('');
  console.log(`${CYAN}${BOLD}  ┌${line}┐${R}`);
  console.log(`${CYAN}${BOLD}  │${R}  ${BOLD}tunnel${R} is live!${' '.repeat(32)}${CYAN}${BOLD}│${R}`);
  console.log(`${CYAN}${BOLD}  ├${line}┤${R}`);
  console.log(`${CYAN}${BOLD}  │${R}  Subdomain  ${WHITE}${subdomain}${R}${' '.repeat(Math.max(0, 35 - subdomain.length))}${CYAN}${BOLD}│${R}`);
  console.log(`${CYAN}${BOLD}  │${R}  Public     ${WHITE}${publicUrl}${R}${' '.repeat(Math.max(0, 35 - publicUrl.length))}${CYAN}${BOLD}│${R}`);
  console.log(`${CYAN}${BOLD}  │${R}  Forwarding ${WHITE}localhost:${localPort}${R}${' '.repeat(Math.max(0, 25 - String(localPort).length))}${CYAN}${BOLD}│${R}`);
  console.log(`${CYAN}${BOLD}  └${line}┘${R}`);
  console.log('');
}

module.exports = { logRequest, info, success, warn, error, banner };
