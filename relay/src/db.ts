import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@comet/data";

export type SnapshotRelayDb = ReturnType<typeof createSnapshotRelayDb>["db"];

export function createSnapshotRelayDb(url?: string) {
  const connectionString = url ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const sql = postgres(connectionString, {
    max: 50,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
  const db = drizzle(sql, { schema });

  return { db, sql };
}
