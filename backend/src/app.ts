import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { healthRouter } from './routes/health.routes.js';
import { authRouter } from './auth/auth.routes.js';

export function createApp(): Express {
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
  app.use('/api/v1/auth', authRouter);

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
