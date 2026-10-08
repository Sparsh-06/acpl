import type { Types } from 'mongoose';
import type { UserDocument } from '../../models/User.js';

/**
 * All ticket authorization rules live in one place, so they are easy to read,
 * test and change. Routes call these functions; the frontend receives the
 * results as `permissions` so it never has to duplicate the rules.
 */
type TicketLike = { createdBy: Types.ObjectId | { _id: Types.ObjectId }; status: string };

const ownerId = (ticket: TicketLike) =>
  '_id' in ticket.createdBy ? ticket.createdBy._id : ticket.createdBy;

export const isAdmin = (user: UserDocument) => user.role === 'ADMIN';

export const isOwner = (user: UserDocument, ticket: TicketLike) => ownerId(ticket).equals(user._id);

export const canView = (user: UserDocument, ticket: TicketLike) => isAdmin(user) || isOwner(user, ticket);

/** Closed tickets are read-only for everyone. An admin can re-open one by changing its status. */
export const canComment = (user: UserDocument, ticket: TicketLike) =>
  canView(user, ticket) && ticket.status !== 'CLOSED';

/** Owners can close their own ticket. Admins change status through the manage endpoint. */
export const canClose = (user: UserDocument, ticket: TicketLike) =>
  isOwner(user, ticket) && ticket.status !== 'CLOSED';

export const canManage = (user: UserDocument) => isAdmin(user);

export const permissionsFor = (user: UserDocument, ticket: TicketLike) => ({
  canComment: canComment(user, ticket),
  canClose: canClose(user, ticket),
  canManage: canManage(user),
});
