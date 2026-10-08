import { Schema, model } from 'mongoose';
import { jsonOptions } from './json.js';

export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

const ticketSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    status: { type: String, enum: TICKET_STATUSES, required: true, default: 'OPEN' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: jsonOptions },
);

ticketSchema.index({ createdBy: 1, updatedAt: -1 });

export const Ticket = model('Ticket', ticketSchema);
