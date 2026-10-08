import type { CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const SESSION_COOKIE = 'session';

const ttlSeconds = () => Math.round(env.SESSION_TTL_HOURS * 3600);

/** The token only carries the user id. Role and active status are re-read from the DB on every request. */
export const signSessionToken = (userId: string) =>
  jwt.sign({}, env.JWT_SECRET, { subject: userId, expiresIn: ttlSeconds(), algorithm: 'HS256' });

export const verifySessionToken = (token: string): string => {
  const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  if (typeof payload === 'string' || !payload.sub) throw new Error('Malformed token');
  return payload.sub;
};

/**
 * httpOnly: JavaScript (including any injected script) cannot read the token.
 * sameSite=lax: the browser won't attach it to cross-site POST/PATCH requests (CSRF mitigation).
 */
export const sessionCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.COOKIE_SECURE,
  path: '/',
  maxAge: ttlSeconds() * 1000,
});
