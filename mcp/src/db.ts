/**
 * Runtime-agnostic SQLite wrapper.
 * Uses bun:sqlite when running under Bun, falls back to better-sqlite3 for Node.js.
 */

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

async function openBunDatabase(path: string): Promise<DB> {
  const { Database } = await import("bun:sqlite");
  const raw = new Database(path);
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
          return stmt.get(...(params as never[])) as Record<
            string,
            unknown
          > | null;
        },
        all(...params: unknown[]) {
          return stmt.all(...(params as never[])) as Record<string, unknown>[];
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

function openNodeDatabase(path: string): DB {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BetterSqlite3 = require("better-sqlite3") as {
    new (filename: string): BetterSqlite3Database;
  };
  const raw = new BetterSqlite3(path);
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

let db: DB | null = null;

export async function openDatabase(path: string): Promise<DB> {
  if (db) {
    return db;
  }
  db = isBun ? await openBunDatabase(path) : openNodeDatabase(path);
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA busy_timeout = 5000");
  db.run("PRAGMA foreign_keys = ON");
  return db;
}

export function getDatabase(): DB {
  if (!db) {
    throw new Error("Database not initialized. Call openDatabase() first.");
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
