import type { Request, RequestHandler } from 'express';
import { forbidden, unauthorized } from '../lib/errors.js';
import { SESSION_COOKIE, verifySessionToken } from '../lib/session.js';
import { User, type Role, type UserDocument } from '../models/User.js';

declare global {
  namespace Express {
    interface Request {
      user?: UserDocument;
    }
  }
}

/**
 * Verifies the session cookie AND re-loads the user from the database.
 * Loading the user on every request means a deactivated user or a role change
 * takes effect immediately, instead of waiting for the token to expire.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token: string | undefined = req.cookies?.[SESSION_COOKIE];
  if (!token) throw unauthorized();

  let userId: string;
  try {
    userId = verifySessionToken(token);
  } catch {
    throw unauthorized('Your session is invalid or has expired. Please sign in again.');
  }

  const user = await User.findById(userId);
  if (!user || !user.isActive) {
    throw unauthorized('Your account is no longer active. Please sign in again.');
  }

  req.user = user;
  next();
};

/** Must run after requireAuth. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) throw forbidden();
    next();
  };

/** The authenticated user; only call inside routes protected by requireAuth. */
export const currentUser = (req: Request): UserDocument => {
  if (!req.user) throw unauthorized();
  return req.user;
};
