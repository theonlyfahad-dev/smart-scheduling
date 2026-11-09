import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from './schema.js';
import { env } from '../config/env.js';

export type AppSchema = typeof schema;
export type PgDrizzleDatabase = NodePgDatabase<AppSchema>;
export type PgliteDrizzleDatabase = PgliteDatabase<AppSchema>;
export type AppDatabase = PgDrizzleDatabase | PgliteDrizzleDatabase;
export type DatabaseExecutor = any;

export type AdapterStatus = 'connected' | 'disconnected' | 'error';

export interface DatabaseAdapter {
  readonly type: 'pg' | 'pglite';
  readonly status: AdapterStatus;
  readonly db: AppDatabase;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

// ---------------------------------------------------------------------------
// 1. PostgreSQL Adapter
// ---------------------------------------------------------------------------
export interface PostgresAdapterOptions {
  databaseUrl?: string;
  pool?: pg.Pool;
}

export class PostgresAdapter implements DatabaseAdapter {
  public readonly type = 'pg' as const;
  private _status: AdapterStatus = 'disconnected';
  private _pool: pg.Pool | null = null;
  private _db: PgDrizzleDatabase | null = null;
  private readonly databaseUrl?: string;
  private readonly injectedPool?: pg.Pool;

  constructor(options?: PostgresAdapterOptions) {
    this.databaseUrl = options?.databaseUrl ?? env.DATABASE_URL;
    this.injectedPool = options?.pool;
  }

  public get status(): AdapterStatus {
    return this._status;
  }

  public get db(): PgDrizzleDatabase {
    if (!this._db || this._status !== 'connected') {
      throw new Error('[PostgreSQL Adapter] Database is not connected. Call connect() before accessing db.');
    }
    return this._db;
  }

  public async connect(): Promise<void> {
    // Prevent duplicate connections
    if (this._status === 'connected' && this._pool) {
      return;
    }

    try {
      if (this.injectedPool) {
        this._pool = this.injectedPool;
      } else {
        if (!this.databaseUrl) {
          throw new Error('DATABASE_URL is required for PostgreSQL connection.');
        }
        if (!/^postgres(ql)?:\/\/.+/.test(this.databaseUrl)) {
          throw new Error(`Invalid PostgreSQL URL: "${this.databaseUrl}". Expected postgres:// or postgresql:// scheme.`);
        }

        this._pool = new pg.Pool({
          connectionString: this.databaseUrl,
        });
      }

      // Verify connection via quick probe
      const client = await this._pool.connect();
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }

      this._db = drizzlePg(this._pool, { schema });
      this._status = 'connected';
    } catch (err: unknown) {
      this._status = 'error';
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[PostgreSQL Adapter] Connection failed: ${msg}`);
    }
  }

  public async disconnect(): Promise<void> {
    if (this._status === 'disconnected') {
      return;
    }

    try {
      if (this._pool) {
        await this._pool.end();
      }
    } finally {
      this._pool = null;
      this._db = null;
      this._status = 'disconnected';
    }
  }
}

// ---------------------------------------------------------------------------
// 2. PGlite Adapter
// ---------------------------------------------------------------------------
export interface PgliteAdapterOptions {
  dataDir?: string;
  inMemory?: boolean;
}

export class PgliteAdapter implements DatabaseAdapter {
  public readonly type = 'pglite' as const;
  private _status: AdapterStatus = 'disconnected';
  private _client: PGlite | null = null;
  private _db: PgliteDrizzleDatabase | null = null;
  private readonly dataDir: string;
  private readonly inMemory: boolean;

  constructor(options?: PgliteAdapterOptions) {
    this.inMemory = options?.inMemory ?? false;
    this.dataDir = options?.dataDir ?? env.PGDATA_PATH;
  }

  public get status(): AdapterStatus {
    return this._status;
  }

  public get db(): PgliteDrizzleDatabase {
    if (!this._db || this._status !== 'connected') {
      throw new Error('[PGlite Adapter] Database is not connected. Call connect() before accessing db.');
    }
    return this._db;
  }

  public async connect(): Promise<void> {
    // Prevent duplicate connections
    if (this._status === 'connected' && this._client) {
      return;
    }

    try {
      if (this.inMemory || !this.dataDir || this.dataDir === ':memory:') {
        this._client = new PGlite();
      } else {
        const resolvedPath = path.resolve(this.dataDir);
        fs.mkdirSync(resolvedPath, { recursive: true });
        this._client = new PGlite(resolvedPath);
      }

      await this._client.waitReady;
      this._db = drizzlePglite(this._client, { schema });
      this._status = 'connected';
    } catch (err: unknown) {
      this._status = 'error';
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[PGlite Adapter] Connection failed: ${msg}`);
    }
  }

  public async disconnect(): Promise<void> {
    if (this._status === 'disconnected') {
      return;
    }

    try {
      if (this._client) {
        await this._client.close();
      }
    } finally {
      this._client = null;
      this._db = null;
      this._status = 'disconnected';
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Adapter Factory
// ---------------------------------------------------------------------------
export interface CreateAdapterOptions {
  adapter?: 'pg' | 'pglite';
  databaseUrl?: string;
  dataDir?: string;
  inMemory?: boolean;
  pool?: pg.Pool;
}

export function createDatabaseAdapter(options?: CreateAdapterOptions): DatabaseAdapter {
  const chosenAdapter = options?.adapter ?? env.DB_ADAPTER;

  if (chosenAdapter === 'pg') {
    return new PostgresAdapter({
      databaseUrl: options?.databaseUrl,
      pool: options?.pool,
    });
  }

  return new PgliteAdapter({
    dataDir: options?.dataDir,
    inMemory: options?.inMemory,
  });
}

// Default application singleton adapter
export const dbAdapter = createDatabaseAdapter();
