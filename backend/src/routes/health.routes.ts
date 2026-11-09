import { Router, Request, Response } from 'express';
import { env } from '../config/env.js';
import { dbAdapter } from '../db/client.js';

export const healthRouter = Router();

const startTime = Date.now();

healthRouter.get('/health', async (_req: Request, res: Response) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  res.status(200).json({
    status: 'ok',
    service: 'smart-campus-backend',
    version: '0.1.0',
    environment: env.NODE_ENV,
    uptimeSeconds,
    timestamp: new Date().toISOString(),
    database: {
      adapter: dbAdapter.type,
      status: dbAdapter.status,
    },
  });
});
