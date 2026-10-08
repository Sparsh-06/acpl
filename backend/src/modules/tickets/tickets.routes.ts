import { Router, type Request } from 'express';
import { z } from 'zod';
import { forbidden, notFound } from '../../lib/errors.js';
import { escapeRegex, objectId } from '../../lib/validation.js';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { Comment } from '../../models/Comment.js';
import { TICKET_STATUSES, Ticket } from '../../models/Ticket.js';

const status = z.enum(TICKET_STATUSES, `Status must be one of ${TICKET_STATUSES.join(', ')}`);

const createTicketSchema = z.object({
  title: z.string().trim().min(5, 'Title must be at least 5 characters').max(150),
  description: z.string().trim().min(10, 'Please describe the issue in at least 10 characters').max(5000),
});

const updateStatusSchema = z.object({ status });

const commentSchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty').max(5000),
});

const listTicketsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: status.optional(),
});

/**
 * Loads a ticket the current user is allowed to see: admins see every ticket,
 * users only their own. Other people's tickets return 404 (not 403) so users
 * can't tell whether a ticket id exists.
 */
async function findVisibleTicket(req: Request) {
  const user = currentUser(req);
  const id = objectId.safeParse(req.params.id);
  if (!id.success) throw notFound('Ticket');

  const ticket = await Ticket.findById(id.data);
  const allowed = ticket && (user.role === 'ADMIN' || ticket.createdBy.equals(user._id));
  if (!allowed) throw notFound('Ticket');
  return ticket;
}

export const ticketsRouter = Router();
ticketsRouter.use(requireAuth);

ticketsRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const { q, status } = listTicketsQuery.parse(req.query);

  // A regular user can only ever list their own tickets, whatever filters they send.
  const filter: Record<string, unknown> = user.role === 'ADMIN' ? {} : { createdBy: user._id };
  if (status) filter.status = status;
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ title: pattern }, { description: pattern }];
  }

  const tickets = await Ticket.find(filter).sort({ updatedAt: -1 }).populate('createdBy', 'name email');
  res.json({ tickets });
});

ticketsRouter.post('/', requireRole('USER'), async (req, res) => {
  const data = createTicketSchema.parse(req.body);
  const ticket = await Ticket.create({ ...data, createdBy: currentUser(req)._id });
  await ticket.populate('createdBy', 'name email');
  res.status(201).json({ ticket });
});

ticketsRouter.get('/:id', async (req, res) => {
  const ticket = await findVisibleTicket(req);
  const comments = await Comment.find({ ticket: ticket._id }).sort({ createdAt: 1 }).populate('author', 'name role');
  await ticket.populate('createdBy', 'name email');
  res.json({ ticket, comments });
});

// Admins can set any status. Users can only close their own ticket.
ticketsRouter.patch('/:id/status', async (req, res) => {
  const user = currentUser(req);
  const { status } = updateStatusSchema.parse(req.body);
  const ticket = await findVisibleTicket(req);

  if (user.role !== 'ADMIN' && status !== 'CLOSED') {
    throw forbidden('You can only close your own tickets');
  }

  ticket.status = status;
  await ticket.save();
  await ticket.populate('createdBy', 'name email');
  res.json({ ticket });
});

ticketsRouter.post('/:id/comments', async (req, res) => {
  const { body } = commentSchema.parse(req.body);
  const ticket = await findVisibleTicket(req);

  const comment = await Comment.create({ ticket: ticket._id, author: currentUser(req)._id, body });
  await comment.populate('author', 'name role');
  res.status(201).json({ comment });
});
