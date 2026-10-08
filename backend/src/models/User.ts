import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { jsonOptions } from './json.js';

export const ROLES = ['ADMIN', 'USER'] as const;
export type Role = (typeof ROLES)[number];

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, default: 'USER' },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, toJSON: jsonOptions },
);

userSchema.index({ name: 1 });

export type UserAttrs = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<UserAttrs>;

export const User = model('User', userSchema);
