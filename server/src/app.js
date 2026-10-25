import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { config } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const clientDistPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../client/dist',
);

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Requests without an Origin header (same-origin navigation, curl, tests) are allowed;
        // browsers always send Origin on cross-origin requests.
        if (!origin || config.clientOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    });
  });

  app.use('/api', notFoundHandler);

  if (config.serveClient) {
    app.use(express.static(clientDistPath, { index: false, maxAge: '1h' }));
    // Single-page app fallback: let React Router handle every non-API GET route.
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
