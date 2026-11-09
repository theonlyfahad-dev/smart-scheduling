import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z
  .object({
    PORT: z.coerce.number().default(5000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    DB_ADAPTER: z.enum(['pg', 'pglite']).default('pglite'),
    DATABASE_URL: z.string().optional(),
    PGDATA_PATH: z.string().default('./data/pglite'),
    CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  })
  .superRefine((data, ctx) => {
    if (data.DB_ADAPTER === 'pg') {
      if (!data.DATABASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message: 'DATABASE_URL is required when DB_ADAPTER is set to "pg"',
        });
      } else if (!/^postgres(ql)?:\/\/.+/.test(data.DATABASE_URL)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message: 'DATABASE_URL must be a valid postgres:// or postgresql:// URL',
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
