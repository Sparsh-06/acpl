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

/** Logs in and returns a supertest agent that keeps the session cookie. */
async function loginAs(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

async function createTicket(agent: Awaited<ReturnType<typeof loginAs>>, title = 'Printer is on fire') {
  const res = await agent.post('/api/tickets').send({ title, description: 'Smoke is coming out of the printer.' });
  expect(res.status).toBe(201);
  return res.body.ticket as { id: string; key: string; status: string };
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
    expect(search.body.items).toHaveLength(1);

    const updated = await admin.patch(`/api/users/${created.body.user.id}`).send({ role: 'ADMIN', isActive: false });
    expect(updated.body.user).toMatchObject({ role: 'ADMIN', isActive: false });
  });

  it('prevents an admin from locking themselves out', async () => {
    const admin = await loginAs('admin@test.dev');
    const me = await admin.get('/api/auth/me');
    const res = await admin.patch(`/api/users/${me.body.user.id}`).send({ isActive: false });
    expect(res.status).toBe(409);
  });
});

describe('tickets', () => {
  it('lets a user create a ticket with a sequential key', async () => {
    const alice = await loginAs('alice@test.dev');
    const first = await createTicket(alice);
    const second = await createTicket(alice, 'Second problem here');
    expect(first).toMatchObject({ key: 'TCK-0001', status: 'OPEN' });
    expect(second.key).toBe('TCK-0002');
  });

  it('validates ticket input', async () => {
    const alice = await loginAs('alice@test.dev');
    const res = await alice.post('/api/tickets').send({ title: 'Hi', priority: 'WHENEVER' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details.fieldErrors)).toEqual(expect.arrayContaining(['title', 'description', 'priority']));
  });

  it("hides other users' tickets (404, not 403) and scopes lists to the owner", async () => {
    const alice = await loginAs('alice@test.dev');
    const bob = await loginAs('bob@test.dev');
    const ticket = await createTicket(alice);

    expect((await bob.get(`/api/tickets/${ticket.id}`)).status).toBe(404);
    expect((await bob.post(`/api/tickets/${ticket.id}/comments`).send({ body: 'sneaky' })).status).toBe(404);
    expect((await bob.post(`/api/tickets/${ticket.id}/close`)).status).toBe(404);
    expect((await bob.get('/api/tickets')).body.total).toBe(0);
    expect((await alice.get('/api/tickets')).body.total).toBe(1);
  });

  it('forbids users from admin-only ticket operations', async () => {
    const alice = await loginAs('alice@test.dev');
    const ticket = await createTicket(alice);
    expect((await alice.patch(`/api/tickets/${ticket.id}`).send({ status: 'RESOLVED' })).status).toBe(403);
  });

  it('lets admins assign, change status, search and filter', async () => {
    const alice = await loginAs('alice@test.dev');
    const admin = await loginAs('admin@test.dev');
    const ticket = await createTicket(alice);
    const me = (await admin.get('/api/auth/me')).body.user;

    const updated = await admin.patch(`/api/tickets/${ticket.id}`).send({ status: 'IN_PROGRESS', assigneeId: me.id });
    expect(updated.status).toBe(200);
    expect(updated.body.ticket).toMatchObject({ status: 'IN_PROGRESS', assignee: { id: me.id } });
    expect(updated.body.ticket.activity.map((a: { type: string }) => a.type)).toEqual(['CREATED', 'STATUS_CHANGED', 'ASSIGNED']);

    const invalidStatus = await admin.patch(`/api/tickets/${ticket.id}`).send({ status: 'DONE' });
    expect(invalidStatus.status).toBe(400);

    const aliceId = (await alice.get('/api/auth/me')).body.user.id;
    const assignToUser = await admin.patch(`/api/tickets/${ticket.id}`).send({ assigneeId: aliceId });
    expect(assignToUser.status).toBe(400);

    const filtered = await admin.get('/api/tickets').query({ status: 'IN_PROGRESS', assignee: 'me', q: 'printer' });
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.counts.IN_PROGRESS).toBe(1);
    expect((await admin.get('/api/tickets').query({ q: 'TCK-0001' })).body.total).toBe(1);
  });

  it('supports comments and lets the owner close their ticket', async () => {
    const alice = await loginAs('alice@test.dev');
    const admin = await loginAs('admin@test.dev');
    const ticket = await createTicket(alice);

    expect((await admin.post(`/api/tickets/${ticket.id}/comments`).send({ body: 'Looking into it' })).status).toBe(201);
    expect((await alice.post(`/api/tickets/${ticket.id}/comments`).send({ body: '   ' })).status).toBe(400);

    const closed = await alice.post(`/api/tickets/${ticket.id}/close`);
    expect(closed.body.ticket.status).toBe('CLOSED');
    expect(closed.body.permissions.canComment).toBe(false);

    const detail = await alice.get(`/api/tickets/${ticket.id}`);
    expect(detail.body.comments).toHaveLength(1);
    expect(detail.body.comments[0]).toMatchObject({ body: 'Looking into it', author: { name: 'Admin' } });

    expect((await alice.post(`/api/tickets/${ticket.id}/comments`).send({ body: 'one more thing' })).status).toBe(409);
  });

  it('returns 404 for unknown ids and routes', async () => {
    const admin = await loginAs('admin@test.dev');
    expect((await admin.get('/api/tickets/not-an-id')).status).toBe(404);
    expect((await admin.get(`/api/tickets/${new mongoose.Types.ObjectId()}`)).status).toBe(404);
    expect((await admin.get('/api/nope')).body.error.code).toBe('NOT_FOUND');
  });
});
