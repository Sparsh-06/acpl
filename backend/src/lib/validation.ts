import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

export const objectId = z.string().refine(isValidObjectId, 'Invalid id');

/** Escape user input before using it in a RegExp, so "a.*" is searched literally. */
export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
