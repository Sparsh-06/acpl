import type { ToObjectOptions } from 'mongoose';

/**
 * Applied to every model's toJSON(): expose `id` instead of `_id`, drop `__v`,
 * and make sure a password hash can never be serialized into a response.
 */
export const jsonOptions: ToObjectOptions = {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret._id;
    delete ret.passwordHash;
    return ret;
  },
};
