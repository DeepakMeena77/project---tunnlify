'use strict';

const assert = require('assert');
const {
  PATH_TUNNEL_COOKIE,
  barePathTunnelRedirect,
  extractPathTunnelFromUrl,
  preparePathTunnelResponse,
  resolvePathTunnelFallback,
  rewriteLocation,
} = require('../lib/path-mode');

let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  ok  ${label}`);
    passed++;
  } catch (err) {
    console.error(`  fail ${label}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

console.log('\n  lib/path-mode.js - Unit Tests\n');

test('extracts a path-mode tunnel route', () => {
  assert.deepStrictEqual(extractPathTunnelFromUrl('/t/demo/assets/app.css?v=1'), {
    subdomain: 'demo',
    path: '/assets/app.css?v=1',
    mode: 'path',
  });
});

test('redirects bare path-mode mount URLs to a trailing slash', () => {
  assert.strictEqual(barePathTunnelRedirect('/t/demo'), '/t/demo/');
  assert.strictEqual(barePathTunnelRedirect('/t/demo?x=1'), '/t/demo/?x=1');
  assert.strictEqual(barePathTunnelRedirect('/t/demo/'), null);
});

test('falls back to referer for unprefixed asset requests', () => {
  const route = resolvePathTunnelFallback({
    url: '/src/main.jsx',
    headers: { referer: 'https://example.com/t/demo/' },
  });
  assert.deepStrictEqual(route, {
    subdomain: 'demo',
    path: '/src/main.jsx',
    mode: 'path-referer',
  });
});

test('falls back to cookie for follow-up module requests', () => {
  const route = resolvePathTunnelFallback({
    url: '/node_modules/.vite/deps/react.js?v=123',
    headers: { cookie: `${PATH_TUNNEL_COOKIE}=demo` },
  });
  assert.deepStrictEqual(route, {
    subdomain: 'demo',
    path: '/node_modules/.vite/deps/react.js?v=123',
    mode: 'path-cookie',
  });
});

test('does not use cookie fallback for the backend root', () => {
  const route = resolvePathTunnelFallback({
    url: '/',
    headers: { cookie: `${PATH_TUNNEL_COOKIE}=demo` },
  });
  assert.strictEqual(route, null);
});

test('rewrites HTML asset URLs and updates headers', () => {
  const html = [
    '<!doctype html>',
    '<link rel="stylesheet" href="/assets/app.css">',
    '<script type="module" src="/src/main.jsx"></script>',
    '<img srcset="/small.png 1x, /large.png 2x">',
    '<div style="background:url(/hero.png)"></div>',
  ].join('');

  const prepared = preparePathTunnelResponse({
    route: { subdomain: 'demo', mode: 'path' },
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-length': Buffer.byteLength(html),
      etag: '"old"',
    },
    body: Buffer.from(html),
  });

  const body = prepared.body.toString('utf8');
  assert.match(body, /href="\/t\/demo\/assets\/app\.css"/);
  assert.match(body, /src="\/t\/demo\/src\/main\.jsx"/);
  assert.match(body, /srcset="\/t\/demo\/small\.png 1x, \/t\/demo\/large\.png 2x"/);
  assert.match(body, /url\(\/t\/demo\/hero\.png\)/);
  assert.strictEqual(prepared.headers.etag, undefined);
  assert.strictEqual(prepared.headers['content-length'], Buffer.byteLength(prepared.body));
  assert.match(String(prepared.headers['set-cookie']), new RegExp(`${PATH_TUNNEL_COOKIE}=demo`));
});

test('rewrites Vite-style JavaScript imports and root fetches', () => {
  const js = 'import React from "/node_modules/.vite/deps/react.js"; import "/src/index.css"; fetch("/api/data");';
  const prepared = preparePathTunnelResponse({
    route: { subdomain: 'demo', mode: 'path' },
    headers: { 'content-type': 'application/javascript' },
    body: Buffer.from(js),
  });

  assert.strictEqual(
    prepared.body.toString('utf8'),
    'import React from "/t/demo/node_modules/.vite/deps/react.js"; import "/t/demo/src/index.css"; fetch("/t/demo/api/data");'
  );
});

test('rewrites CSS url and import references', () => {
  const css = '@import "/fonts.css"; .hero { background-image: url("/hero.png"); }';
  const prepared = preparePathTunnelResponse({
    route: { subdomain: 'demo', mode: 'path' },
    headers: { 'content-type': 'text/css' },
    body: Buffer.from(css),
  });

  assert.strictEqual(
    prepared.body.toString('utf8'),
    '@import "/t/demo/fonts.css"; .hero { background-image: url("/t/demo/hero.png"); }'
  );
});

test('rewrites root-relative and localhost redirects', () => {
  assert.strictEqual(rewriteLocation('/login', 'demo'), '/t/demo/login');
  assert.strictEqual(rewriteLocation('http://localhost:5173/settings?tab=billing', 'demo'), '/t/demo/settings?tab=billing');
  assert.strictEqual(rewriteLocation('https://example.com/login', 'demo'), 'https://example.com/login');
});

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
