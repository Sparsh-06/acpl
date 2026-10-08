import { Schema, model } from 'mongoose';
import { jsonOptions } from './json.js';

const commentSchema = new Schema(
  {
    ticket: { type: Schema.Types.ObjectId, ref: 'Ticket', required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
  },
  { timestamps: true, toJSON: jsonOptions },
);

commentSchema.index({ ticket: 1, createdAt: 1 });

export const Comment = model('Comment', commentSchema);
