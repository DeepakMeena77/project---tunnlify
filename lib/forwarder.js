'use strict';

const http  = require('http');
const https = require('https');

/**
 * Forward an HTTP request to localhost:<port> and return the response.
 *
 * @param {object} opts
 * @param {number}  opts.port        Local service port
 * @param {string}  opts.method      HTTP method (GET, POST, …)
 * @param {string}  opts.path        Request path + query string
 * @param {object}  opts.headers     Request headers
 * @param {Buffer|null} opts.body    Request body (may be null)
 * @returns {Promise<{status:number, headers:object, body:Buffer}>}
 */
function forwardRequest({ port, method, path, headers, body }) {
  return new Promise((resolve, reject) => {
    // Rewrite Host so the local server sees itself, not the tunnel domain
    const localHeaders = {
      ...headers,
      host: `localhost:${port}`,
    };

    // Remove hop-by-hop headers that must not be forwarded
    const HOP_BY_HOP = [
      'connection', 'keep-alive', 'transfer-encoding', 'te',
      'trailer', 'upgrade', 'proxy-authorization', 'proxy-authenticate',
    ];
    HOP_BY_HOP.forEach((h) => delete localHeaders[h]);

    const options = {
      hostname: 'localhost',
      port,
      path,
      method,
      headers: localHeaders,
    };

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({
          status:  res.statusCode,
          headers: res.headers,
          body:    Buffer.concat(chunks),
        })
      );
      res.on('error', reject);
    });

    req.on('error', reject);

    if (body && body.length > 0) {
      req.write(body);
    }
    req.end();
  });
}

module.exports = { forwardRequest };
