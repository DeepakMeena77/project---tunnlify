'use strict';

/**
 * auth/middleware.js
 * ──────────────────
 * Express middleware that validates the Authorization: Bearer <jwt> header.
 *
 * On success, attaches req.user = { id, email, subdomain } and calls next().
 * On failure, returns 401.
 */

const { verifyToken } = require('./tokens');

/**
 * requireAuth — attach to any route that needs a valid JWT.
 *
 * @example
 *   router.get('/me', requireAuth, (req, res) => res.json(req.user));
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';

  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authorization header missing or not Bearer scheme',
    });
  }

  const token = authHeader.slice(7).trim();

  try {
    const decoded = verifyToken(token);
    // Attach a clean user object so downstream handlers don't touch raw JWT fields
    req.user = {
      id:        decoded.sub,
      email:     decoded.email,
      subdomain: decoded.subdomain,
    };
    next();
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    return res.status(401).json({
      error:   expired ? 'TokenExpired' : 'InvalidToken',
      message: expired ? 'Your session has expired — please log in again' : 'Invalid token',
    });
  }
}

module.exports = { requireAuth };
