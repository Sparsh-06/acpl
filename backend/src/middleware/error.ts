import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

export const notFoundHandler: RequestHandler = (req) => {
  throw new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`);
};

/** Turns every error into the same JSON shape: { error: { code, message, details? } }. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // Request body / query failed Zod validation -> 400 with a message per field.
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) {
      fieldErrors[issue.path.join('.') || '_'] ??= issue.message;
    }
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Please check the highlighted fields', details: { fieldErrors } } });
    return;
  }

  // Errors we threw on purpose (401, 403, 404, ...).
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }

  // MongoDB unique index violation, e.g. two users with the same email.
  if (err?.code === 11000) {
    res.status(409).json({
      error: { code: 'CONFLICT', message: 'That email is already in use', details: { fieldErrors: { email: 'That email is already in use' } } },
    });
    return;
  }

  // Malformed JSON body.
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Request body is not valid JSON' } });
    return;
  }

  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
};
