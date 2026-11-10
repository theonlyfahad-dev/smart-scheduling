import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { healthRouter } from './routes/health.routes.js';
import { authRouter, createAuthRouter } from './auth/auth.routes.js';
import { createAdminMasterDataRouter } from './routes/admin/master-data.routes.js';
import type { DatabaseExecutor } from './db/client.js';

export function createApp(customDb?: DatabaseExecutor): Express {
  const app = express();

  // Basic security and parsing middleware
  app.use(cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true,
  }));
  app.use(express.json());
  app.use(cookieParser());

  // API v1 routes
  app.use('/api/v1', healthRouter);
  app.use('/api/v1/auth', customDb ? createAuthRouter(customDb) : authRouter);
  app.use('/api/v1/admin', createAdminMasterDataRouter(customDb));

  // Root fallback
  app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      name: 'Smart Campus (SmartTT) API',
      status: 'operational',
      docs: '/api/v1/health',
    });
  });

  return app;
}
