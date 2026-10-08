import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { jsonOptions } from './json.js';

export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export const ACTIVITY_TYPES = ['CREATED', 'STATUS_CHANGED', 'ASSIGNED', 'PRIORITY_CHANGED'] as const;

/**
 * The activity log is embedded: it is small, always read together with the
 * ticket, and only ever appended to. Comments, by contrast, live in their own
 * collection because they can grow without bound.
 */
const activitySchema = new Schema(
  {
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    from: { type: String, default: null },
    to: { type: String, default: null },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { _id: false },
);

const ticketSchema = new Schema(
  {
    number: { type: Number, required: true, unique: true },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    status: { type: String, enum: TICKET_STATUSES, required: true, default: 'OPEN' },
    priority: { type: String, enum: TICKET_PRIORITIES, required: true, default: 'MEDIUM' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignee: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    activity: { type: [activitySchema], default: [] },
  },
  { timestamps: true, toJSON: jsonOptions },
);

// Human-friendly reference shown in the UI, e.g. TCK-0042.
ticketSchema.virtual('key').get(function (this: { number: number }) {
  return `TCK-${String(this.number).padStart(4, '0')}`;
});

// Indexes match the list queries: users list their own tickets, admins filter by status/assignee.
ticketSchema.index({ createdBy: 1, updatedAt: -1 });
ticketSchema.index({ status: 1, updatedAt: -1 });
ticketSchema.index({ assignee: 1, updatedAt: -1 });

export type TicketAttrs = InferSchemaType<typeof ticketSchema>;
export type TicketDocument = HydratedDocument<TicketAttrs>;

export const Ticket = model('Ticket', ticketSchema);
