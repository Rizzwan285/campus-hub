import fs from 'fs';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { PGlite } from '@electric-sql/pglite';
import { pool } from '../../src/db';
import { createApp } from '../../src/app';
import { issueToken } from '../../src/auth/tokens';
import { invalidate } from '../../src/middleware/cache';
import { forgetActiveSemester } from '../../src/repositories/semesters.repository';

const MIGRATIONS = path.resolve(__dirname, '../../db/migrations');

/**
 * One connection, shared, taken in turn. PGlite is a single session, so a
 * transaction must finish before anything else may run on it - which is also
 * the rule the repositories follow against a real pool: no query on the pool
 * while a transaction's connection is held.
 */
class Turnstile {
  private tail: Promise<void> = Promise.resolve();

  async take(): Promise<() => void> {
    let release!: () => void;
    const mine = new Promise<void>((resolve) => { release = resolve; });
    const previous = this.tail;
    this.tail = previous.then(() => mine);
    await previous;
    return release;
  }
}

export interface Harness {
  db: PGlite;
  url: string;
  /** Runs SQL straight on the test database. */
  sql: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;
  api: <T = unknown>(
    method: string,
    route: string,
    options?: { token?: string | null; body?: unknown; raw?: Buffer; headers?: Record<string, string> },
  ) => Promise<{ status: number; body: T }>;
  /** Creates a student (or admin) and returns their id and session token. */
  user: (roll: string, profile?: Partial<{ name: string; role: string; program: string; branch: string; year: string; batch: string }>) =>
    Promise<{ id: string; roll: string; token: string }>;
  close: () => Promise<void>;
}

/** Applies migrations in order; `only` picks which (by file name). */
export async function migrate(db: PGlite, only: (file: string) => boolean = () => true): Promise<void> {
  for (const file of fs.readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort()) {
    if (!only(file)) continue;
    // gen_random_uuid() is built in; the extension itself is not shipped.
    const sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8')
      .replace(/create extension if not exists "pgcrypto";/i, '');
    await db.exec(sql);
  }
}

export async function startHarness(options: { migrations?: (file: string) => boolean } = {}): Promise<Harness> {
  const db = new PGlite();
  await migrate(db, options.migrations);

  const turnstile = new Turnstile();
  const run = async (text: string, params?: unknown[]) => {
    const result = await db.query(text, params as unknown[]);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length, fields: result.fields };
  };

  const patched = pool as unknown as Record<string, unknown>;
  patched.query = async (text: string, params?: unknown[]) => {
    const release = await turnstile.take();
    try {
      return await run(text, params);
    } finally {
      release();
    }
  };
  patched.connect = async () => {
    const release = await turnstile.take();
    let released = false;
    return {
      query: run,
      release: () => {
        if (!released) {
          released = true;
          release();
        }
      },
    };
  };

  forgetActiveSemester();
  invalidate();

  const server: Server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const sql: Harness['sql'] = async (text, params) => (await run(text, params)).rows as never[];

  return {
    db,
    url,
    sql,
    async api<T = unknown>(method: string, route: string, options: Parameters<Harness['api']>[2] = {}) {
      const headers: Record<string, string> = { ...(options.headers ?? {}) };
      if (options.token) headers.Authorization = `Bearer ${options.token}`;
      let body: string | Buffer | undefined;
      if (options.raw) {
        headers['Content-Type'] = 'application/octet-stream';
        body = options.raw;
      } else if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(options.body);
      }
      const response = await fetch(`${url}${route}`, { method, headers, body });
      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      return { status: response.status, body: parsed as T };
    },
    async user(roll, profile = {}) {
      const rows = await sql<{ id: string }>(
        `insert into profiles (roll_number, name, role, mess, program, branch, year_of_study, batch_no)
         values ($1, $2, $3, 'Nila', $4, $5, $6, $7) returning id`,
        [roll, profile.name ?? `Student ${roll}`, profile.role ?? 'student', profile.program ?? 'UG',
          profile.branch ?? 'CSE', profile.year ?? '2', profile.batch ?? null],
      );
      const { token } = issueToken({ id: rows[0].id, roll_number: roll, role: profile.role ?? 'student' });
      return { id: rows[0].id, roll, token };
    },
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.close();
    },
  };
}

/** The academic-context key the client sends with a course selection. */
export function contextOf(profile: { program?: string; branch?: string; year?: string; batch?: string | null } = {}) {
  return JSON.stringify([profile.program ?? 'UG', profile.branch ?? 'CSE', profile.year ?? '2', null]);
}
