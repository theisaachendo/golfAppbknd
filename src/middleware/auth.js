import jwt from 'jsonwebtoken';
import { getUserById } from '../data/store.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// Long-lived sessions: a casual scorekeeping app shouldn't log players out
// mid-round. 90 days by default; override with JWT_EXPIRES_IN (e.g. '30d').
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '90d';

export function signToken(payload, expiresIn = JWT_EXPIRES_IN) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * Optional auth: sets req.user if valid Bearer token present; does not 401.
 */
export async function optionalAuth(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    req.user = null;
    return next();
  }
  const payload = verifyToken(token);
  if (!payload?.userId) {
    req.user = null;
    return next();
  }
  try {
    req.user = (await getUserById(payload.userId)) || null;
  } catch (err) {
    console.error('optionalAuth lookup failed:', err);
    req.user = null;
  }
  next();
}

/**
 * Require auth: 401 if no valid user.
 */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Valid token required' });
  }
  next();
}
