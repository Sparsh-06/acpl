import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError, unauthorized } from '../../lib/errors.js';
import { SESSION_COOKIE, sessionCookieOptions, signSessionToken } from '../../lib/session.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { User } from '../../models/User.js';

const loginSchema = z.object({
  email: z.email('Enter a valid email address').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

// Used when the email does not exist, so the response time is the same either way
// and attackers can't discover which emails are registered by timing the request.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

// Brute-force protection: 10 attempts per IP per 15 minutes.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skip: () => env.NODE_ENV === 'test',
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(new AppError(429, 'TOO_MANY_REQUESTS', 'Too many login attempts. Please try again in a few minutes.')),
});

export const authRouter = Router();

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await User.findOne({ email }).select('+passwordHash');
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !passwordOk) throw unauthorized('Invalid email or password');
  if (!user.isActive) throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been deactivated. Contact an administrator.');

  res.cookie(SESSION_COOKIE, signSessionToken(user.id), sessionCookieOptions());
  res.json({ user });
});

authRouter.post('/logout', (_req, res) => {
  const { maxAge: _maxAge, ...options } = sessionCookieOptions();
  res.clearCookie(SESSION_COOKIE, options);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: currentUser(req) });
});
