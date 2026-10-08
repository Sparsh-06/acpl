/**
 * Every expected failure is thrown as an AppError and converted to a consistent
 * JSON shape by the error middleware:
 *   { "error": { "code": "NOT_FOUND", "message": "Ticket not found", "details": ... } }
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'You do not have permission to perform this action') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (resource = 'Resource') =>
  new AppError(404, 'NOT_FOUND', `${resource} not found`);

export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);
