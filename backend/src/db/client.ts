import { env } from '../config/env.js';

export interface DatabaseAdapter {
  type: 'pg' | 'pglite';
  status: 'connected' | 'not_configured' | 'not_checked';
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

/**
 * Placeholder Database Adapter implementation for Step 1 scaffolding.
 * Real database connection and Drizzle ORM integration are implemented in Step 2.
 */
class DatabaseAdapterPlaceholder implements DatabaseAdapter {
  public type: 'pg' | 'pglite';
  public status: 'connected' | 'not_configured' | 'not_checked' = 'not_configured';

  constructor(type: 'pg' | 'pglite') {
    this.type = type;
  }

  async connect(): Promise<void> {
    // Step 1: No real database connection is established yet.
    // Real database client and Drizzle schema will be initialized in Step 2.
    this.status = 'not_configured';
  }

  async disconnect(): Promise<void> {
    this.status = 'not_configured';
  }
}

export function createDatabaseAdapter(): DatabaseAdapter {
  return new DatabaseAdapterPlaceholder(env.DB_ADAPTER);
}

export const dbAdapter = createDatabaseAdapter();
