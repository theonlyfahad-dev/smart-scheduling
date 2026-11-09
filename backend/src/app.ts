import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { healthRouter } from './routes/health.routes.js';

export function createApp(): Express {
  const app = express();

  // Basic security and parsing middleware
  app.use(cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true,
  }));
  app.use(express.json());

  // Health check routes
  app.use('/api/v1', healthRouter);

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
