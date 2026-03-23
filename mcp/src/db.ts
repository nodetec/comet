/**
 * Runtime-agnostic SQLite wrapper.
 * Uses bun:sqlite when running under Bun, falls back to better-sqlite3 for Node.js.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Database as BetterSqlite3Database } from "better-sqlite3";

export interface Statement {
  run(...params: unknown[]): { changes: number };
  get(...params: unknown[]): Record<string, unknown> | null;
  all(...params: unknown[]): Record<string, unknown>[];
}

export interface DB {
  prepare(sql: string): Statement;
  run(sql: string): void;
  transaction<T>(fn: () => T): () => T;
  close(): void;
}

const isBun = typeof globalThis.Bun !== "undefined";
const ACCOUNT_DATABASE_FILE = "comet.db";
const ACCOUNTS_DIR = "accounts";

type DatabaseOpener = (path: string) => DB;
type ActiveAccountPathResolver = (appDbPath: string) => string;

function createBunDatabase(raw: {
  close(): void;
  prepare(sql: string): {
    run(...params: never[]): void;
    get(...params: never[]): Record<string, unknown> | null;
    all(...params: never[]): Record<string, unknown>[];
  };
  run(sql: string): void;
  transaction<T>(fn: () => T): () => T;
}): DB {
  return {
    prepare(sql: string) {
      const stmt = raw.prepare(sql);
      return {
        run(...params: unknown[]) {
          stmt.run(...(params as never[]));
          const changesRow = raw.prepare("SELECT changes() AS c").get() as {
            c: number;
          } | null;
          return { changes: changesRow?.c ?? 0 };
        },
        get(...params: unknown[]) {
          return stmt.get(...(params as never[]));
        },
        all(...params: unknown[]) {
          return stmt.all(...(params as never[]));
        },
      };
    },
    run(sql: string) {
      raw.run(sql);
    },
    transaction<T>(fn: () => T): () => T {
      return raw.transaction(fn) as () => T;
    },
    close() {
      raw.close();
    },
  };
}

function createNodeDatabase(raw: BetterSqlite3Database): DB {
  return {
    prepare(sql: string) {
      const stmt = raw.prepare(sql);
      return {
        run(...params: unknown[]) {
          const result = stmt.run(...params);
          return { changes: result.changes };
        },
        get(...params: unknown[]) {
          return (
            (stmt.get(...params) as Record<string, unknown> | undefined) ?? null
          );
        },
        all(...params: unknown[]) {
          return stmt.all(...params) as Record<string, unknown>[];
        },
      };
    },
    run(sql: string) {
      raw.exec(sql);
    },
    transaction<T>(fn: () => T): () => T {
      return raw.transaction(fn) as () => T;
    },
    close() {
      raw.close();
    },
  };
}

let openRuntimeDatabase: DatabaseOpener | null = null;
let resolveActiveAccountPath: ActiveAccountPathResolver | null = null;
let appDatabasePath: string | null = null;

async function initializeRuntime(): Promise<void> {
  if (openRuntimeDatabase && resolveActiveAccountPath) {
    return;
  }

  if (isBun) {
    const { Database } = await import("bun:sqlite");
    openRuntimeDatabase = (path: string) =>
      createBunDatabase(new Database(path));
    resolveActiveAccountPath = (path: string) => {
      const raw = new Database(path, { readonly: true });
      try {
        const row = raw
          .query("SELECT npub FROM accounts WHERE is_active = 1 LIMIT 1")
          .get() as { npub: string } | null;
        if (!row?.npub) {
          throw new Error(
            `No active Comet account found in ${path}. Open the Comet app once to initialize it.`,
          );
        }
        return join(
          dirname(path),
          ACCOUNTS_DIR,
          row.npub,
          ACCOUNT_DATABASE_FILE,
        );
      } finally {
        raw.close();
      }
    };
    return;
  }

  const { default: BetterSqlite3 } = await import("better-sqlite3");
  openRuntimeDatabase = (path: string) => {
    const raw = new BetterSqlite3(path);
    return createNodeDatabase(raw);
  };
  resolveActiveAccountPath = (path: string) => {
    const raw = new BetterSqlite3(path, {
      readonly: true,
    });
    try {
      const row = raw
        .prepare("SELECT npub FROM accounts WHERE is_active = 1 LIMIT 1")
        .get() as { npub: string } | undefined;
      if (!row?.npub) {
        throw new Error(
          `No active Comet account found in ${path}. Open the Comet app once to initialize it.`,
        );
      }
      return join(dirname(path), ACCOUNTS_DIR, row.npub, ACCOUNT_DATABASE_FILE);
    } finally {
      raw.close();
    }
  };
}

function configureDatabaseConnection(nextDb: DB): DB {
  nextDb.run("PRAGMA journal_mode = WAL");
  nextDb.run("PRAGMA busy_timeout = 5000");
  nextDb.run("PRAGMA foreign_keys = ON");
  return nextDb;
}

function resolveCurrentDatabasePath(): string {
  if (!appDatabasePath || !resolveActiveAccountPath) {
    throw new Error(
      "Database runtime not initialized. Call openDatabase() first.",
    );
  }

  const nextPath = resolveActiveAccountPath(appDatabasePath);
  if (!existsSync(nextPath)) {
    throw new Error(
      `Active Comet account database not found at ${nextPath}. Make sure the account has been initialized.`,
    );
  }

  return nextPath;
}

function openResolvedDatabase(path: string): DB {
  if (!openRuntimeDatabase) {
    throw new Error(
      "Database runtime not initialized. Call openDatabase() first.",
    );
  }
  return configureDatabaseConnection(openRuntimeDatabase(path));
}

export async function openDatabase(path: string): Promise<void> {
  appDatabasePath = path;
  await initializeRuntime();
  const db = openResolvedDatabase(resolveCurrentDatabasePath());
  db.close();
}

export function withDatabase<T>(fn: (db: DB) => T): T {
  const db = openResolvedDatabase(resolveCurrentDatabasePath());
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

export function closeDatabase(): void {
  appDatabasePath = null;
}
