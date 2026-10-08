/**
 * Resets the database and inserts demo data. Development only.
 *   npm run seed
 * Demo passwords can be overridden with SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD.
 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Comment } from '../models/Comment.js';
import { nextSequence } from '../models/Counter.js';
import { Ticket } from '../models/Ticket.js';
import { User } from '../models/User.js';

const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
const USER_PASSWORD = process.env.SEED_USER_PASSWORD ?? 'User@12345';

async function seed() {
  if (env.NODE_ENV === 'production') throw new Error('Refusing to seed a production database');

  await mongoose.connect(env.MONGODB_URI);
  await mongoose.connection.dropDatabase();
  await mongoose.syncIndexes();

  const [adminHash, userHash] = await Promise.all([bcrypt.hash(ADMIN_PASSWORD, 12), bcrypt.hash(USER_PASSWORD, 12)]);

  const [admin, agent, alice, bob] = await User.create([
    { name: 'Ava Admin', email: 'admin@example.com', passwordHash: adminHash, role: 'ADMIN' },
    { name: 'Sam Support', email: 'support@example.com', passwordHash: adminHash, role: 'ADMIN' },
    { name: 'Alice Johnson', email: 'alice@example.com', passwordHash: userHash, role: 'USER' },
    { name: 'Bob Smith', email: 'bob@example.com', passwordHash: userHash, role: 'USER' },
  ]);
  await User.create({ name: 'Dana Former', email: 'dana@example.com', passwordHash: userHash, role: 'USER', isActive: false });

  const ticketData = [
    { by: alice, title: 'Cannot reset my password', description: 'The reset email never arrives, I checked spam as well.', priority: 'HIGH', status: 'IN_PROGRESS', assignee: agent },
    { by: alice, title: 'Invoice shows wrong company name', description: 'Our latest invoice lists our old company name. Please update it.', priority: 'MEDIUM', status: 'OPEN', assignee: null },
    { by: bob, title: 'Dashboard loads very slowly', description: 'Since yesterday the dashboard takes over 20 seconds to load.', priority: 'URGENT', status: 'OPEN', assignee: admin },
    { by: bob, title: 'Request to export my data', description: 'I would like a CSV export of all my account data.', priority: 'LOW', status: 'RESOLVED', assignee: agent },
  ] as const;

  for (const t of ticketData) {
    const ticket = await Ticket.create({
      number: await nextSequence('ticket'),
      title: t.title,
      description: t.description,
      priority: t.priority,
      status: t.status,
      createdBy: t.by._id,
      assignee: t.assignee?._id ?? null,
      activity: [
        { type: 'CREATED', actor: t.by._id },
        ...(t.assignee ? [{ type: 'ASSIGNED', actor: admin._id, to: t.assignee.name }] : []),
        ...(t.status !== 'OPEN' ? [{ type: 'STATUS_CHANGED', actor: admin._id, from: 'OPEN', to: t.status }] : []),
      ],
    });

    await Comment.create({ ticket: ticket._id, author: t.by._id, body: 'Thanks in advance for looking into this!' });
    if (t.assignee) {
      await Comment.create({ ticket: ticket._id, author: t.assignee._id, body: "Hi! I'm on it and will update you shortly." });
    }
  }

  console.log('Seed complete:');
  console.log(`  Admin: admin@example.com / ${ADMIN_PASSWORD}  (also support@example.com)`);
  console.log(`  User:  alice@example.com / ${USER_PASSWORD}  (also bob@example.com)`);
  console.log(`  Inactive user: dana@example.com`);
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
