import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

export const notFoundHandler: RequestHandler = (req) => {
  throw new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`);
};

/** Turns every error into the same JSON shape: { error: { code, message, details? } }. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      fieldErrors[key] ??= issue.message;
    }
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Please check the highlighted fields', details: { fieldErrors } },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }

  // Unique index violation, e.g. two users with the same email.
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern ?? {})[0] ?? 'field';
    res.status(409).json({
      error: { code: 'CONFLICT', message: `That ${field} is already in use`, details: { fieldErrors: { [field]: `This ${field} is already in use` } } },
    });
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const fieldErrors = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: { fieldErrors } } });
    return;
  }

  // Malformed JSON body from express.json()
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Request body is not valid JSON' } });
    return;
  }

  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
};
