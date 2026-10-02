import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import type { PrismaService } from '../../src/prisma.service';
import { seedReference } from '../../src/seed/reference';

function localTestDatabaseUrl(): URL {
  const value = process.env.DATABASE_URL;
  if (process.env.NODE_ENV !== 'test' || !value) {
    throw new Error('Database fixtures require NODE_ENV=test and DATABASE_URL');
  }
  const url = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)
  ) {
    throw new Error('Database fixtures require local PostgreSQL');
  }
  return url;
}

/** Guard suites that write to the disposable database owned by the runner. */
export function requireIsolatedDatabase(): void {
  const url = localTestDatabaseUrl();
  if (!/^\/ulms_test_\d+_\d+$/.test(url.pathname)) {
    throw new Error(
      'Run via tests/run-isolated.mjs --backend; isolated local DB required',
    );
  }
}

export interface IsolatedTestDatabase {
  client: PrismaService;
  /** A separate pool, for transactions that must commit independently. */
  createClient(): PrismaService;
  dispose(): Promise<void>;
}

/**
 * Own a database for one suite without changing process.env.DATABASE_URL.
 * The supplied URL is used only to create/drop the generated database; fixture
 * writes, migrations and optional reference seeding use that new database.
 */
export async function createIsolatedDatabase(
  suite: string,
  options: { seedReferenceData?: boolean } = {},
): Promise<IsolatedTestDatabase> {
  if (!/^[a-z][a-z0-9_]{0,39}$/.test(suite)) {
    throw new Error('Invalid isolated database suite name');
  }
  const url = localTestDatabaseUrl();
  const name = `ulms_test_${suite}_${process.pid}_${randomUUID().replaceAll('-', '')}`;
  if (name.length > 63) {
    throw new Error(
      'Isolated database name exceeds PostgreSQL identifier limit',
    );
  }
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.toString(), max: 3 }),
  });
  const clients: PrismaClient[] = [];
  let created = false;

  async function dropOwnedDatabase(): Promise<void> {
    if (!created) return;
    // Never derive a DROP target from the supplied database URL.
    if (!/^ulms_test_[a-z][a-z0-9_]{0,39}_\d+_[a-f0-9]{32}$/.test(name)) {
      throw new Error('Refusing to drop an unowned test database');
    }
    await admin.$queryRaw`
      SELECT pg_terminate_backend(pid) FROM pg_stat_activity
      WHERE datname = ${name} AND pid <> pg_backend_pid()
    `;
    await admin.$executeRawUnsafe(`DROP DATABASE "${name}"`);
    created = false;
  }

  async function dispose(): Promise<void> {
    try {
      await Promise.all(clients.map((client) => client.$disconnect()));
    } finally {
      try {
        await dropOwnedDatabase();
      } finally {
        await admin.$disconnect();
      }
    }
  }

  function createClient(): PrismaService {
    const client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url.toString(), max: 3 }),
    });
    clients.push(client);
    // These tests consume Prisma queries, not Nest's module lifecycle hooks.
    return client as PrismaService;
  }

  try {
    await admin.$connect();
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    created = true;
    url.pathname = `/${name}`;
    const backendRoot = resolve(__dirname, '../..');
    await promisify(execFile)(
      process.execPath,
      [
        resolve(backendRoot, 'node_modules/prisma/build/index.js'),
        'migrate',
        'deploy',
      ],
      {
        cwd: backendRoot,
        env: { ...process.env, DATABASE_URL: url.toString() },
        windowsHide: true,
        timeout: 45_000,
      },
    );
    const client = createClient();
    await client.$connect();
    if (options.seedReferenceData) await seedReference(client);
    return { client, createClient, dispose };
  } catch (error) {
    try {
      await dispose();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Isolated database setup and cleanup both failed',
      );
    }
    throw error;
  }
}
