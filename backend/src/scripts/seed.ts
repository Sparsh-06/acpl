// Dev only: wipes the DB and adds demo data.
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Comment } from '../models/Comment.js';
import { Ticket } from '../models/Ticket.js';
import { User } from '../models/User.js';

const ADMIN_PASSWORD = 'Admin@12345';
const USER_PASSWORD = 'User@12345';

async function seed() {
  if (env.NODE_ENV === 'production') throw new Error('Refusing to seed a production database');

  await mongoose.connect(env.MONGODB_URI);
  await mongoose.connection.dropDatabase();
  await mongoose.syncIndexes();

  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const userHash = await bcrypt.hash(USER_PASSWORD, 10);

  const [admin, alice, bob] = await User.create([
    { name: 'Ava Admin', email: 'admin@example.com', passwordHash: adminHash, role: 'ADMIN' },
    { name: 'Alice Johnson', email: 'alice@example.com', passwordHash: userHash, role: 'USER' },
    { name: 'Bob Smith', email: 'bob@example.com', passwordHash: userHash, role: 'USER' },
    { name: 'Dana Former', email: 'dana@example.com', passwordHash: userHash, role: 'USER', isActive: false },
  ]);

  const tickets = await Ticket.create([
    { createdBy: alice._id, title: 'Cannot reset my password', description: 'The reset email never arrives, I checked spam as well.', status: 'IN_PROGRESS' },
    { createdBy: alice._id, title: 'Invoice shows wrong company name', description: 'Our latest invoice lists our old company name.', status: 'OPEN' },
    { createdBy: bob._id, title: 'Dashboard loads very slowly', description: 'Since yesterday the dashboard takes over 20 seconds to load.', status: 'OPEN' },
    { createdBy: bob._id, title: 'Request to export my data', description: 'I would like a CSV export of all my account data.', status: 'RESOLVED' },
  ]);

  for (const ticket of tickets) {
    await Comment.create({ ticket: ticket._id, author: ticket.createdBy, body: 'Thanks in advance for looking into this!' });
    if (ticket.status !== 'OPEN') {
      await Comment.create({ ticket: ticket._id, author: admin._id, body: "Hi! I'm looking into this and will update you shortly." });
    }
  }

  console.log('Seed complete:');
  console.log(`  Admin: admin@example.com / ${ADMIN_PASSWORD}`);
  console.log(`  User:  alice@example.com / ${USER_PASSWORD}  (also bob@example.com)`);
  console.log('  Inactive user: dana@example.com');
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
