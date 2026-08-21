/**
 * Applies every .sql file in db/migrations that has not run yet, in filename
 * order, each inside a transaction. Safe to re-run.
 *
 *   npm run migrate
 */
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { config } from '../src/config';
import { sslConfig } from '../src/ssl';

const MIGRATIONS_DIR = path.resolve(__dirname, '../db/migrations');

async function main() {
  // DDL runs over the session pooler: the transaction pooler does not keep a
  // session between statements, which breaks some DDL and advisory locking.
  const connectionString = config.DIRECT_URL ?? config.DATABASE_URL;
  const client = new Client({ connectionString, ssl: sslConfig(connectionString) });

  await client.connect();
  console.log('Connected to database.');

  await client.query(`
    create table if not exists schema_migrations (
      version    text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const { rows } = await client.query<{ version: string }>('select version from schema_migrations');
  const applied = new Set(rows.map((row) => row.version));

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip    ${file} (already applied)`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    process.stdout.write(`  apply   ${file} ... `);

    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations (version) values ($1)', [file]);
      await client.query('commit');
      console.log('ok');
      ran += 1;
    } catch (error) {
      await client.query('rollback');
      console.log('FAILED');
      throw error;
    }
  }

  await client.end();
  console.log(ran === 0 ? 'Database already up to date.' : `Applied ${ran} migration(s).`);
}

main().catch((error) => {
  console.error('\nMigration failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
