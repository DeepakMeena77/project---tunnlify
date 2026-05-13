'use strict';

const PATH_TUNNEL_COOKIE = 'tunnlify_path_tunnel';
const PATH_TUNNEL_COOKIE_MAX_AGE = 60 * 60;

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function pathTunnelPrefix(subdomain) {
  return `/t/${encodeURIComponent(String(subdomain).toLowerCase())}`;
}

function extractPathTunnelFromUrl(reqUrl = '') {
  let url;
  try {
    url = new URL(reqUrl, 'http://tunnlify.local');
  } catch {
    return null;
  }

  const match = url.pathname.match(/^\/t\/([^/]+)(\/.*)?$/);
  if (!match) return null;

  const subdomain = safeDecodeURIComponent(match[1]).toLowerCase();
  const forwardedPath = `${match[2] || '/'}${url.search}`;
  return { subdomain, path: forwardedPath, mode: 'path' };
}

function extractPathTunnelSubdomain(value = '') {
  return extractPathTunnelFromUrl(value)?.subdomain ?? null;
}

function barePathTunnelRedirect(reqUrl = '') {
  let url;
  try {
    url = new URL(reqUrl, 'http://tunnlify.local');
  } catch {
    return null;
  }

  if (!/^\/t\/[^/]+$/.test(url.pathname)) return null;
  return `${url.pathname}/${url.search}`;
}

function parseCookieHeader(cookieHeader = '') {
  const cookies = {};
  String(cookieHeader)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) return;
      const key = part.slice(0, eqIdx).trim();
      const value = part.slice(eqIdx + 1).trim();
      cookies[key] = safeDecodeURIComponent(value);
    });
  return cookies;
}

function isCookieFallbackCandidate(reqUrl = '') {
  let url;
  try {
    url = new URL(reqUrl, 'http://tunnlify.local');
  } catch {
    return false;
  }

  const pathname = url.pathname;
  return pathname !== '/' &&
    !pathname.startsWith('/t/') &&
    !pathname.startsWith('/auth') &&
    !pathname.startsWith('/billing') &&
    pathname !== '/status';
}

function resolvePathTunnelFallback(req) {
  const headers = req.headers || {};
  const refererSubdomain = extractPathTunnelSubdomain(headers.referer || headers.referrer || '');
  if (refererSubdomain) {
    return { subdomain: refererSubdomain, path: req.url, mode: 'path-referer' };
  }

  if (!isCookieFallbackCandidate(req.url)) return null;

  const cookies = parseCookieHeader(headers.cookie || '');
  const cookieSubdomain = cookies[PATH_TUNNEL_COOKIE];
  if (!cookieSubdomain) return null;

  return { subdomain: cookieSubdomain.toLowerCase(), path: req.url, mode: 'path-cookie' };
}

function findHeaderKey(headers, name) {
  const wanted = name.toLowerCase();
  return Object.keys(headers || {}).find((key) => key.toLowerCase() === wanted);
}

function getHeader(headers, name) {
  const key = findHeaderKey(headers, name);
  if (!key) return undefined;
  const value = headers[key];
  return Array.isArray(value) ? value[0] : value;
}

function setHeader(headers, name, value) {
  const key = findHeaderKey(headers, name) || name;
  headers[key] = value;
}

function deleteHeader(headers, name) {
  const key = findHeaderKey(headers, name);
  if (key) delete headers[key];
}

function cloneHeaders(headers = {}) {
  return { ...headers };
}

function shouldPrefixPath(value, prefix) {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    value !== prefix &&
    !value.startsWith(`${prefix}/`);
}

function prefixPath(value, prefix) {
  if (!shouldPrefixPath(value, prefix)) return value;
  if (value === '/') return `${prefix}/`;
  return `${prefix}${value}`;
}

function rewriteSrcset(value, prefix) {
  return value
    .split(',')
    .map((candidate) => {
      const match = candidate.match(/^(\s*)(\/(?!\/)\S*)(.*)$/);
      if (!match) return candidate;
      return `${match[1]}${prefixPath(match[2], prefix)}${match[3]}`;
    })
    .join(',');
}

function rewriteCssReferences(text, prefix) {
  return text
    .replace(/(url\(\s*['"]?)\/(?!\/)([^'")\s]*)(['"]?\s*\))/gi, (match, start, rest, end) =>
      `${start}${prefixPath(`/${rest}`, prefix)}${end}`
    )
    .replace(/(@import\s+(?:url\(\s*)?['"])\/(?!\/)([^'"]*)(["'])/gi, (match, start, rest, end) =>
      `${start}${prefixPath(`/${rest}`, prefix)}${end}`
    );
}

function rewriteHtmlReferences(text, prefix) {
  return rewriteCssReferences(text, prefix)
    .replace(
      /(\b(?:src|href|action|poster|data|formaction|manifest)\s*=\s*["'])\/(?!\/)([^"']*)(["'])/gi,
      (match, start, rest, end) => `${start}${prefixPath(`/${rest}`, prefix)}${end}`
    )
    .replace(/(\bsrcset\s*=\s*["'])([^"']*)(["'])/gi, (match, start, value, end) =>
      `${start}${rewriteSrcset(value, prefix)}${end}`
    )
    .replace(/(<meta\b[^>]*\bcontent\s*=\s*["'][^"']*\burl=)\/(?!\/)([^"']*)(["'])/gi, (match, start, rest, end) =>
      `${start}${prefixPath(`/${rest}`, prefix)}${end}`
    );
}

function rewriteJavaScriptReferences(text, prefix) {
  return text.replace(/(["'`])\/(?!\/)([^"'`\r\n]*)\1/g, (match, quote, rest) =>
    `${quote}${prefixPath(`/${rest}`, prefix)}${quote}`
  );
}

function responseKind(headers) {
  const contentType = String(getHeader(headers, 'content-type') || '').toLowerCase();
  if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) return 'html';
  if (contentType.includes('text/css')) return 'css';
  if (
    contentType.includes('javascript') ||
    contentType.includes('ecmascript') ||
    contentType.includes('application/x-javascript')
  ) return 'js';
  return null;
}

function rewriteBodyForPathTunnel(body, headers, subdomain) {
  if (!Buffer.isBuffer(body) || body.length === 0) {
    return { body, rewritten: false };
  }

  const contentEncoding = String(getHeader(headers, 'content-encoding') || '').toLowerCase();
  if (contentEncoding && contentEncoding !== 'identity') {
    return { body, rewritten: false };
  }

  const kind = responseKind(headers);
  if (!kind) return { body, rewritten: false };

  const prefix = pathTunnelPrefix(subdomain);
  const source = body.toString('utf8');
  let next = source;

  if (kind === 'html') next = rewriteHtmlReferences(source, prefix);
  if (kind === 'css') next = rewriteCssReferences(source, prefix);
  if (kind === 'js') next = rewriteJavaScriptReferences(source, prefix);

  if (next === source) return { body, rewritten: false };
  return { body: Buffer.from(next, 'utf8'), rewritten: true };
}

function rewriteLocation(location, subdomain) {
  if (!location) return location;

  const prefix = pathTunnelPrefix(subdomain);
  if (String(location).startsWith('/') && !String(location).startsWith('//')) {
    return prefixPath(location, prefix);
  }

  try {
    const url = new URL(location);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1') {
      return prefixPath(`${url.pathname}${url.search}${url.hash}`, prefix);
    }
  } catch {
    // Relative redirects that do not start with "/" are already relative to /t/<subdomain>/.
  }

  return location;
}

function appendPathTunnelCookie(headers, subdomain) {
  const cookie = `${PATH_TUNNEL_COOKIE}=${encodeURIComponent(subdomain)}; Path=/; Max-Age=${PATH_TUNNEL_COOKIE_MAX_AGE}; SameSite=Lax`;
  const key = findHeaderKey(headers, 'set-cookie') || 'set-cookie';
  const existing = headers[key];

  if (!existing) {
    headers[key] = cookie;
  } else if (Array.isArray(existing)) {
    headers[key] = [...existing, cookie];
  } else {
    headers[key] = [existing, cookie];
  }
}

function preparePathTunnelResponse({ route, headers, body }) {
  const nextHeaders = cloneHeaders(headers);
  let nextBody = body;

  if (!route || !String(route.mode || '').startsWith('path') || !route.subdomain) {
    return { headers: nextHeaders, body: nextBody };
  }

  const location = getHeader(nextHeaders, 'location');
  if (location) setHeader(nextHeaders, 'location', rewriteLocation(location, route.subdomain));
  appendPathTunnelCookie(nextHeaders, route.subdomain);

  const rewritten = rewriteBodyForPathTunnel(nextBody, nextHeaders, route.subdomain);
  nextBody = rewritten.body;

  if (rewritten.rewritten) {
    deleteHeader(nextHeaders, 'etag');
    deleteHeader(nextHeaders, 'content-md5');
    setHeader(nextHeaders, 'content-length', Buffer.byteLength(nextBody));
  }

  return { headers: nextHeaders, body: nextBody };
}

module.exports = {
  PATH_TUNNEL_COOKIE,
  barePathTunnelRedirect,
  extractPathTunnelFromUrl,
  pathTunnelPrefix,
  preparePathTunnelResponse,
  resolvePathTunnelFallback,
  rewriteBodyForPathTunnel,
  rewriteLocation,
};
