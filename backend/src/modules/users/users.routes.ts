import bcrypt from 'bcryptjs';
import { Router } from 'express';
import type { QueryFilter } from 'mongoose';
import { z } from 'zod';
import { AppError, notFound } from '../../lib/errors.js';
import { escapeRegex, objectId, paginate, paginationQuery } from '../../lib/validation.js';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { ROLES, User, type UserAttrs } from '../../models/User.js';

const BCRYPT_ROUNDS = 12;

const name = z.string().trim().min(2, 'Name must be at least 2 characters').max(100);
const email = z.email('Enter a valid email address').trim().toLowerCase();
const password = z.string().min(8, 'Password must be at least 8 characters').max(128);
const role = z.enum(ROLES, 'Role must be ADMIN or USER');

const createUserSchema = z.object({ name, email, password, role: role.default('USER') });

const updateUserSchema = z
  .object({ name, email, password, role, isActive: z.boolean() })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update');

const listUsersQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  role: role.optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const usersRouter = Router();

// Every route in this router is admin-only; enforced here, on the server.
usersRouter.use(requireAuth, requireRole('ADMIN'));

usersRouter.get('/', async (req, res) => {
  const { q, role, status, page, limit } = listUsersQuery.parse(req.query);

  const filter: QueryFilter<UserAttrs> = {};
  if (role) filter.role = role;
  if (status) filter.isActive = status === 'active';
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }];
  }

  const [items, total] = await Promise.all([
    User.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);
  res.json(paginate(items, total, page, limit));
});

usersRouter.get('/:id', async (req, res) => {
  const id = objectId.parse(req.params.id);
  const user = await User.findById(id);
  if (!user) throw notFound('User');
  res.json({ user });
});

usersRouter.post('/', async (req, res) => {
  const { password, ...data } = createUserSchema.parse(req.body);
  const user = await User.create({ ...data, passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) });
  res.status(201).json({ user });
});

usersRouter.patch('/:id', async (req, res) => {
  const id = objectId.parse(req.params.id);
  const { password, ...changes } = updateUserSchema.parse(req.body);
  const me = currentUser(req);

  // Prevent an admin from locking themselves (and possibly everyone) out.
  if (me.id === id && (changes.isActive === false || (changes.role && changes.role !== 'ADMIN'))) {
    throw new AppError(409, 'SELF_LOCKOUT', 'You cannot deactivate your own account or remove your own admin role');
  }

  const user = await User.findById(id);
  if (!user) throw notFound('User');

  user.set(changes);
  if (password) user.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await user.save();

  res.json({ user });
});
