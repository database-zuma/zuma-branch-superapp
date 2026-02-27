import { Pool } from 'pg';

// Singleton pool pattern — prevents pool exhaustion on Vercel serverless
const globalForPg = globalThis as unknown as { pool: Pool | undefined };

export const pool =
  globalForPg.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPg.pool = pool;
}

export const SCHEMA = 'branch_super_app_clawdbot';
