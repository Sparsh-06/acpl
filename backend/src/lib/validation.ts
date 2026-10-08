import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

export const objectId = z.string().refine(isValidObjectId, 'Invalid id');

/** Shared pagination query params: ?page=1&limit=20 */
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Escape user input before using it in a RegExp, so "a.*" is searched literally. */
export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const paginate = <T>(items: T[], total: number, page: number, limit: number) => ({
  items,
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});
