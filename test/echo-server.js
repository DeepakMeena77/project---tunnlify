'use strict';
// Tiny echo server for integration testing — responds with request info as JSON
const http = require('http');
http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString() || null;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ method: req.method, path: req.url, body }));
  });
}).listen(9999, () => console.log('[echo] Listening on http://localhost:9999'));
