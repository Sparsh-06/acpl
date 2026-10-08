import type { ToObjectOptions } from 'mongoose';

// Hide _id, __v and passwordHash in API responses.
export const jsonOptions: ToObjectOptions = {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret._id;
    delete ret.passwordHash;
    return ret;
  },
};
