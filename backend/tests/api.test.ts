import bcrypt from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';

const app = createApp();
let mongo: MongoMemoryServer;

const PASSWORD = 'Password123!';

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.syncIndexes();
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  await User.create([
    { name: 'Admin', email: 'admin@test.dev', passwordHash, role: 'ADMIN' },
    { name: 'Alice', email: 'alice@test.dev', passwordHash, role: 'USER' },
    { name: 'Bob', email: 'bob@test.dev', passwordHash, role: 'USER' },
  ]);
});

async function loginAs(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

async function createTicket(agent: Awaited<ReturnType<typeof loginAs>>, title = 'Printer is on fire') {
  const res = await agent.post('/api/tickets').send({ title, description: 'Smoke is coming out of the printer.' });
  expect(res.status).toBe(201);
  return res.body.ticket as { id: string; status: string };
}

describe('authentication', () => {
  it('sets an httpOnly session cookie and never returns the password hash', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'ALICE@test.dev', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']?.[0]).toMatch(/session=.*HttpOnly/i);
    expect(res.body.user).toMatchObject({ email: 'alice@test.dev', role: 'USER' });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rejects invalid credentials with a generic message', async () => {
    const wrongPassword = await request(app).post('/api/auth/login').send({ email: 'alice@test.dev', password: 'nope' });
    const unknownEmail = await request(app).post('/api/auth/login').send({ email: 'ghost@test.dev', password: 'nope' });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it('validates the login payload', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors).toHaveProperty('email');
    expect(res.body.error.details.fieldErrors).toHaveProperty('password');
  });

  it('requires authentication for protected routes', async () => {
    expect((await request(app).get('/api/tickets')).status).toBe(401);
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });

  it('immediately revokes access when a user is deactivated', async () => {
    const alice = await loginAs('alice@test.dev');
    await User.updateOne({ email: 'alice@test.dev' }, { isActive: false });
    expect((await alice.get('/api/auth/me')).status).toBe(401);
    const relogin = await request(app).post('/api/auth/login').send({ email: 'alice@test.dev', password: PASSWORD });
    expect(relogin.status).toBe(403);
  });
});

describe('user management authorization', () => {
  it('forbids regular users from managing users', async () => {
    const alice = await loginAs('alice@test.dev');
    expect((await alice.get('/api/users')).status).toBe(403);
    expect((await alice.post('/api/users').send({ name: 'X', email: 'x@test.dev', password: 'whatever123' })).status).toBe(403);
  });

  it('lets admins create, search and update users', async () => {
    const admin = await loginAs('admin@test.dev');
    const created = await admin.post('/api/users').send({ name: 'Carol', email: 'carol@test.dev', password: 'Password123!' });
    expect(created.status).toBe(201);

    const duplicate = await admin.post('/api/users').send({ name: 'Carol 2', email: 'carol@test.dev', password: 'Password123!' });
    expect(duplicate.status).toBe(409);

    const search = await admin.get('/api/users').query({ q: 'car' });
    expect(search.body.users).toHaveLength(1);

    const updated = await admin.patch(`/api/users/${created.body.user.id}`).send({ role: 'ADMIN', isActive: false });
    expect(updated.body.user).toMatchObject({ role: 'ADMIN', isActive: false });
  });

  it('prevents an admin from locking themselves out', async () => {
    const admin = await loginAs('admin@test.dev');
    const me = await admin.get('/api/auth/me');
    const res = await admin.patch(`/api/users/${me.body.user.id}`).send({ isActive: false });
    expect(res.status).toBe(400);
  });
});

describe('tickets', () => {
  it('lets a user create a ticket', async () => {
    const alice = await loginAs('alice@test.dev');
    const ticket = await createTicket(alice);
    expect(ticket.status).toBe('OPEN');
  });

  it('validates ticket input', async () => {
    const alice = await loginAs('alice@test.dev');
    const res = await alice.post('/api/tickets').send({ title: 'Hi' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details.fieldErrors)).toEqual(expect.arrayContaining(['title', 'description']));
  });

  it('only lets users (not admins) create tickets', async () => {
    const admin = await loginAs('admin@test.dev');
    const res = await admin.post('/api/tickets').send({ title: 'Admin ticket', description: 'Admins should not create these.' });
    expect(res.status).toBe(403);
  });

  it("hides other users' tickets (404, not 403) and scopes lists to the owner", async () => {
    const alice = await loginAs('alice@test.dev');
    const bob = await loginAs('bob@test.dev');
    const ticket = await createTicket(alice);

    expect((await bob.get(`/api/tickets/${ticket.id}`)).status).toBe(404);
    expect((await bob.post(`/api/tickets/${ticket.id}/comments`).send({ body: 'sneaky' })).status).toBe(404);
    expect((await bob.patch(`/api/tickets/${ticket.id}/status`).send({ status: 'CLOSED' })).status).toBe(404);
    expect((await bob.get('/api/tickets')).body.tickets).toHaveLength(0);
    expect((await alice.get('/api/tickets')).body.tickets).toHaveLength(1);
  });

  it('lets a user close their own ticket but not set other statuses', async () => {
    const alice = await loginAs('alice@test.dev');
    const ticket = await createTicket(alice);

    const resolve = await alice.patch(`/api/tickets/${ticket.id}/status`).send({ status: 'RESOLVED' });
    expect(resolve.status).toBe(403);

    const close = await alice.patch(`/api/tickets/${ticket.id}/status`).send({ status: 'CLOSED' });
    expect(close.status).toBe(200);
    expect(close.body.ticket.status).toBe('CLOSED');
  });

  it('lets admins see all tickets, search, filter and change status', async () => {
    const alice = await loginAs('alice@test.dev');
    const admin = await loginAs('admin@test.dev');
    const ticket = await createTicket(alice);
    await createTicket(alice, 'Something else entirely');

    expect((await admin.get('/api/tickets')).body.tickets).toHaveLength(2);

    const updated = await admin.patch(`/api/tickets/${ticket.id}/status`).send({ status: 'IN_PROGRESS' });
    expect(updated.body.ticket.status).toBe('IN_PROGRESS');

    const invalid = await admin.patch(`/api/tickets/${ticket.id}/status`).send({ status: 'DONE' });
    expect(invalid.status).toBe(400);

    const filtered = await admin.get('/api/tickets').query({ status: 'IN_PROGRESS', q: 'printer' });
    expect(filtered.body.tickets).toHaveLength(1);
    expect(filtered.body.tickets[0].createdBy.name).toBe('Alice');
  });

  it('shows comments with author and time', async () => {
    const alice = await loginAs('alice@test.dev');
    const admin = await loginAs('admin@test.dev');
    const ticket = await createTicket(alice);

    expect((await admin.post(`/api/tickets/${ticket.id}/comments`).send({ body: 'Looking into it' })).status).toBe(201);
    expect((await alice.post(`/api/tickets/${ticket.id}/comments`).send({ body: '   ' })).status).toBe(400);

    const detail = await alice.get(`/api/tickets/${ticket.id}`);
    expect(detail.body.comments).toHaveLength(1);
    expect(detail.body.comments[0]).toMatchObject({ body: 'Looking into it', author: { name: 'Admin', role: 'ADMIN' } });
    expect(detail.body.comments[0].createdAt).toBeDefined();
  });

  it('returns 404 for unknown ids and routes', async () => {
    const admin = await loginAs('admin@test.dev');
    expect((await admin.get('/api/tickets/not-an-id')).status).toBe(404);
    expect((await admin.get(`/api/tickets/${new mongoose.Types.ObjectId()}`)).status).toBe(404);
    expect((await admin.get('/api/nope')).body.error.code).toBe('NOT_FOUND');
  });
});
