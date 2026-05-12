'use strict';

/**
 * db/requests.js
 * ──────────────
 * Data-access layer for the `requests` table.
 * Called from server.js after every successful tunnel proxy round-trip.
 */

const { query } = require('./pool');

/**
 * Insert one request record.
 * Fire-and-forget safe — errors are caught and logged, never thrown.
 *
 * @param {object} r
 * @param {number}  r.userId
 * @param {string}  r.subdomain
 * @param {string}  r.method
 * @param {string}  r.path
 * @param {number}  [r.statusCode]
 * @param {number}  [r.responseTimeMs]
 * @param {object}  [r.requestHeaders]
 * @param {string}  [r.requestBody]     Raw string, max 64 KB stored
 * @param {object}  [r.responseHeaders]
 * @param {string}  [r.responseBody]    Raw string, max 64 KB stored
 */
async function insertRequest(r) {
  const MAX_BODY = 64 * 1024; // 64 KB cap per stored body

  const safeBody = (b) => {
    if (!b) return null;
    const s = typeof b === 'string' ? b : String(b);
    return s.length > MAX_BODY ? s.slice(0, MAX_BODY) + '\n[truncated]' : s;
  };

  await query(
    `INSERT INTO requests
       (user_id, subdomain, method, path, status_code, response_time_ms,
        request_headers, request_body, response_headers, response_body)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      r.userId,
      r.subdomain,
      r.method,
      r.path,
      r.statusCode   ?? null,
      r.responseTimeMs ?? null,
      r.requestHeaders  ? JSON.stringify(r.requestHeaders)  : null,
      safeBody(r.requestBody),
      r.responseHeaders ? JSON.stringify(r.responseHeaders) : null,
      safeBody(r.responseBody),
    ]
  );
}

/**
 * Fetch the most recent N requests for a user.
 * @param {number} userId
 * @param {number} [limit=100]
 * @returns {Promise<Array>}
 */
async function getRequestsForUser(userId, limit = 100) {
  const { rows } = await query(
    `SELECT id, subdomain, method, path, status_code, response_time_ms,
            request_headers, request_body, response_headers, response_body,
            created_at
     FROM   requests
     WHERE  user_id = $1
     ORDER  BY created_at DESC
     LIMIT  $2`,
    [userId, limit]
  );
  return rows;
}

/**
 * Fetch a single request by id, scoped to a user (prevents info-leak).
 */
async function getRequestById(id, userId) {
  const { rows } = await query(
    `SELECT * FROM requests WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] ?? null;
}

module.exports = { insertRequest, getRequestsForUser, getRequestById };
