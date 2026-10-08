import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { ticketsRouter } from './modules/tickets/tickets.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

/** Builds the Express app without starting a server, so tests can use it directly. */
export function createApp() {
  const app = express();

  // Requests arrive through the Next.js proxy; trust one hop so rate limiting sees the real client IP.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/tickets', ticketsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
