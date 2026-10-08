import { Router, type Request } from 'express';
import { Types, type QueryFilter } from 'mongoose';
import { z } from 'zod';
import { AppError, badRequest, notFound } from '../../lib/errors.js';
import { escapeRegex, objectId, paginate, paginationQuery } from '../../lib/validation.js';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { Comment } from '../../models/Comment.js';
import { nextSequence } from '../../models/Counter.js';
import { TICKET_PRIORITIES, TICKET_STATUSES, Ticket, type TicketAttrs } from '../../models/Ticket.js';
import { User } from '../../models/User.js';
import { canClose, canComment, canView, isAdmin, permissionsFor } from './ticket.policy.js';

const PERSON_FIELDS = 'name email role';

const status = z.enum(TICKET_STATUSES, `Status must be one of ${TICKET_STATUSES.join(', ')}`);
const priority = z.enum(TICKET_PRIORITIES, `Priority must be one of ${TICKET_PRIORITIES.join(', ')}`);

const createTicketSchema = z.object({
  title: z.string().trim().min(5, 'Title must be at least 5 characters').max(150),
  description: z.string().trim().min(10, 'Please describe the issue in at least 10 characters').max(5000),
  priority: priority.default('MEDIUM'),
});

const manageTicketSchema = z
  .object({ status, priority, assigneeId: objectId.nullable() })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Provide status, priority or assigneeId');

const commentSchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty').max(5000),
});

const listTicketsQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  status: status.optional(),
  priority: priority.optional(),
  // "me" = assigned to the requesting admin, "unassigned", or a specific user id
  assignee: z.union([z.literal('me'), z.literal('unassigned'), objectId]).optional(),
  sort: z.enum(['updated', 'newest', 'oldest']).default('updated'),
});

const SORTS = { updated: { updatedAt: -1 }, newest: { createdAt: -1 }, oldest: { createdAt: 1 } } as const;

/**
 * Loads a ticket the current user is allowed to see.
 * Returns 404 (not 403) for other people's tickets so users can't probe which ids exist.
 */
async function loadVisibleTicket(req: Request) {
  const user = currentUser(req);
  const id = objectId.safeParse(req.params.id);
  if (!id.success) throw notFound('Ticket');

  const ticket = await Ticket.findById(id.data);
  if (!ticket || !canView(user, ticket)) throw notFound('Ticket');
  return ticket;
}

const populateTicket = [
  { path: 'createdBy', select: PERSON_FIELDS },
  { path: 'assignee', select: PERSON_FIELDS },
];

export const ticketsRouter = Router();
ticketsRouter.use(requireAuth);

ticketsRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const query = listTicketsQuery.parse(req.query);

  // Scope first: a regular user can only ever see their own tickets, whatever filters they send.
  const scope: QueryFilter<TicketAttrs> = isAdmin(user) ? {} : { createdBy: user._id };

  if (query.q) {
    const ticketNumber = query.q.match(/^(?:tck-?)?(\d+)$/i);
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    scope.$or = [{ title: pattern }, { description: pattern }];
    if (ticketNumber) scope.$or.push({ number: Number(ticketNumber[1]) });
  }
  if (query.priority) scope.priority = query.priority;
  if (query.assignee && isAdmin(user)) {
    scope.assignee =
      query.assignee === 'me' ? user._id : query.assignee === 'unassigned' ? null : new Types.ObjectId(query.assignee);
  }

  const filter = query.status ? { ...scope, status: query.status } : scope;

  const [items, total, statusCounts] = await Promise.all([
    Ticket.find(filter)
      .select('-activity')
      .sort(SORTS[query.sort])
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate(populateTicket),
    Ticket.countDocuments(filter),
    // Per-status totals (ignoring the status filter) power the summary chips in the UI.
    Ticket.aggregate<{ _id: string; count: number }>([{ $match: scope }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  const counts = Object.fromEntries(TICKET_STATUSES.map((s) => [s, 0]));
  for (const { _id, count } of statusCounts) counts[_id] = count;

  res.json({ ...paginate(items, total, query.page, query.limit), counts });
});

ticketsRouter.post('/', requireRole('USER'), async (req, res) => {
  const user = currentUser(req);
  const data = createTicketSchema.parse(req.body);

  const ticket = await Ticket.create({
    ...data,
    number: await nextSequence('ticket'),
    createdBy: user._id,
    activity: [{ type: 'CREATED', actor: user._id }],
  });

  await ticket.populate(populateTicket);
  res.status(201).json({ ticket });
});

ticketsRouter.get('/:id', async (req, res) => {
  const user = currentUser(req);
  const ticket = await loadVisibleTicket(req);

  const [comments] = await Promise.all([
    Comment.find({ ticket: ticket._id }).sort({ createdAt: 1 }).populate('author', PERSON_FIELDS),
    ticket.populate([...populateTicket, { path: 'activity.actor', select: 'name' }]),
  ]);

  res.json({ ticket, comments, permissions: permissionsFor(user, ticket) });
});

// Admin: change status, priority and/or assignment in one request.
ticketsRouter.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const user = currentUser(req);
  const changes = manageTicketSchema.parse(req.body);
  const ticket = await loadVisibleTicket(req);

  if (changes.status && changes.status !== ticket.status) {
    ticket.activity.push({ type: 'STATUS_CHANGED', actor: user._id, from: ticket.status, to: changes.status });
    ticket.status = changes.status;
  }

  if (changes.priority && changes.priority !== ticket.priority) {
    ticket.activity.push({ type: 'PRIORITY_CHANGED', actor: user._id, from: ticket.priority, to: changes.priority });
    ticket.priority = changes.priority;
  }

  if (changes.assigneeId !== undefined && String(ticket.assignee ?? null) !== String(changes.assigneeId)) {
    let toName: string | null = null;
    if (changes.assigneeId) {
      // Tickets can only be assigned to active support staff (admins).
      const assignee = await User.findOne({ _id: changes.assigneeId, role: 'ADMIN', isActive: true });
      if (!assignee) throw badRequest('Tickets can only be assigned to an active admin', { fieldErrors: { assigneeId: 'Choose an active admin' } });
      toName = assignee.name;
    }
    const previous = ticket.assignee ? await User.findById(ticket.assignee).select('name') : null;
    ticket.activity.push({ type: 'ASSIGNED', actor: user._id, from: previous?.name ?? null, to: toName });
    ticket.assignee = changes.assigneeId ? new Types.ObjectId(changes.assigneeId) : null;
  }

  await ticket.save();
  await ticket.populate([...populateTicket, { path: 'activity.actor', select: 'name' }]);
  res.json({ ticket, permissions: permissionsFor(user, ticket) });
});

// Owner: close their own ticket.
ticketsRouter.post('/:id/close', async (req, res) => {
  const user = currentUser(req);
  const ticket = await loadVisibleTicket(req);

  if (!canClose(user, ticket)) {
    throw ticket.status === 'CLOSED'
      ? new AppError(409, 'ALREADY_CLOSED', 'This ticket is already closed')
      : new AppError(403, 'FORBIDDEN', 'Only the ticket creator can close this ticket');
  }

  ticket.activity.push({ type: 'STATUS_CHANGED', actor: user._id, from: ticket.status, to: 'CLOSED' });
  ticket.status = 'CLOSED';
  await ticket.save();
  await ticket.populate([...populateTicket, { path: 'activity.actor', select: 'name' }]);
  res.json({ ticket, permissions: permissionsFor(user, ticket) });
});

ticketsRouter.post('/:id/comments', async (req, res) => {
  const user = currentUser(req);
  const { body } = commentSchema.parse(req.body);
  const ticket = await loadVisibleTicket(req);

  if (!canComment(user, ticket)) {
    throw new AppError(409, 'TICKET_CLOSED', 'This ticket is closed. Comments are no longer accepted.');
  }

  const comment = await Comment.create({ ticket: ticket._id, author: user._id, body });
  // Bump updatedAt so recently discussed tickets sort to the top.
  await Ticket.updateOne({ _id: ticket._id }, { $set: { updatedAt: new Date() } });

  await comment.populate('author', PERSON_FIELDS);
  res.status(201).json({ comment });
});
