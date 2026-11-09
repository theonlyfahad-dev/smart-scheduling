import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsFolder = path.resolve(__dirname, '../../drizzle');

export async function runMigrations(): Promise<void> {
  console.log(`[Smart Campus] Running migrations against adapter: ${env.DB_ADAPTER}...`);

  if (env.DB_ADAPTER === 'pg') {
    const { default: pg } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');

    const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
    const db = drizzle(pool);

    try {
      await migrate(db, { migrationsFolder });
      console.log('[Smart Campus] PostgreSQL migrations completed successfully.');
    } finally {
      await pool.end();
    }
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');

    const client = new PGlite(env.PGDATA_PATH);
    const db = drizzle(client);

    try {
      await migrate(db, { migrationsFolder });
      console.log('[Smart Campus] PGlite migrations completed successfully.');
    } finally {
      await client.close();
    }
  }
}

// Execute directly if run as a CLI script
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations().catch((err) => {
    console.error('[Smart Campus] Fatal migration error:', err);
    process.exit(1);
  });
}
