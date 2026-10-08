import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { badRequest, notFound } from '../../lib/errors.js';
import { escapeRegex, objectId } from '../../lib/validation.js';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { ROLES, User } from '../../models/User.js';

const name = z.string().trim().min(2, 'Name must be at least 2 characters').max(100);
const email = z.email('Enter a valid email address').trim().toLowerCase();
const password = z.string().min(8, 'Password must be at least 8 characters').max(128);
const role = z.enum(ROLES, 'Role must be ADMIN or USER');

const createUserSchema = z.object({ name, email, password, role: role.default('USER') });

const updateUserSchema = z.object({ name, email, password, role, isActive: z.boolean() }).partial();

const listUsersQuery = z.object({ q: z.string().trim().max(100).optional() });

export const usersRouter = Router();

usersRouter.use(requireAuth, requireRole('ADMIN'));

usersRouter.get('/', async (req, res) => {
  const { q } = listUsersQuery.parse(req.query);

  const filter: Record<string, unknown> = {};
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }];
  }

  const users = await User.find(filter).sort({ name: 1 });
  res.json({ users });
});

usersRouter.get('/:id', async (req, res) => {
  const user = await User.findById(objectId.parse(req.params.id));
  if (!user) throw notFound('User');
  res.json({ user });
});

usersRouter.post('/', async (req, res) => {
  const { password, ...data } = createUserSchema.parse(req.body);
  const user = await User.create({ ...data, passwordHash: await bcrypt.hash(password, 10) });
  res.status(201).json({ user });
});

usersRouter.patch('/:id', async (req, res) => {
  const id = objectId.parse(req.params.id);
  const { password, ...changes } = updateUserSchema.parse(req.body);

  // Stop an admin from locking themselves out.
  if (currentUser(req).id === id && (changes.isActive === false || changes.role === 'USER')) {
    throw badRequest('You cannot deactivate yourself or remove your own admin role');
  }

  const user = await User.findById(id);
  if (!user) throw notFound('User');

  user.set(changes);
  if (password) user.passwordHash = await bcrypt.hash(password, 10);
  await user.save();

  res.json({ user });
});
