import { Pool, types } from 'pg';
import { config } from './config';
import { sslConfig } from './ssl';

// numeric and int8 come back as strings by default to protect large values;
// nothing in this schema (prices, serial ids) can exceed the safe range.
types.setTypeParser(types.builtins.NUMERIC, (value) => parseFloat(value));
types.setTypeParser(types.builtins.INT8, (value) => parseInt(value, 10));

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: sslConfig(config.DATABASE_URL),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err.message);
});

export async function query<T>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function healthcheck(): Promise<boolean> {
  try {
    await pool.query('select 1');
    return true;
  } catch {
    return false;
  }
}
