import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

const APP_IDENTIFIER = "md.comet-alpha";
const DEV_IDENTIFIER = "md.comet-alpha.dev";
const APP_DATABASE_FILE = "app.db";
const ACCOUNT_DATABASE_FILE = "comet.db";
const ACCOUNTS_DIR = "accounts";

const isBun = typeof globalThis.Bun !== "undefined";

export async function resolveDatabasePath(dev: boolean): Promise<string> {
  const appDbPath = resolveAppDatabasePath(dev);
  const dbPath = await resolveActiveAccountDatabasePath(appDbPath);
  if (!existsSync(dbPath)) {
    throw new Error(
      `Active Comet account database not found at ${dbPath}. Make sure the account has been initialized.`,
    );
  }

  return dbPath;
}

export function resolveAppDatabasePath(dev: boolean): string {
  const appDir = resolveAppDataDir(dev);
  const dbPath = join(appDir, APP_DATABASE_FILE);
  if (!existsSync(dbPath)) {
    throw new Error(
      `Comet app database not found at ${dbPath}. Make sure the Comet app has been run at least once.`,
    );
  }

  return dbPath;
}

function resolveAppDataDir(dev: boolean): string {
  const identifier = dev ? DEV_IDENTIFIER : APP_IDENTIFIER;
  const home = homedir();
  const os = platform();

  let configDir: string;
  if (os === "darwin") {
    configDir = join(home, "Library", "Application Support", identifier);
  } else if (os === "win32") {
    const appdata = process.env.APPDATA ?? join(home, "AppData", "Roaming");
    configDir = join(appdata, identifier);
  } else {
    configDir = join(
      process.env.XDG_CONFIG_HOME ?? join(home, ".config"),
      identifier,
    );
  }

  return configDir;
}

async function resolveActiveAccountDatabasePath(
  appDbPath: string,
): Promise<string> {
  const sql = "SELECT npub FROM accounts WHERE is_active = 1 LIMIT 1";
  const appDir = dirname(appDbPath);

  if (isBun) {
    const { Database } = await import("bun:sqlite");
    const db = new Database(appDbPath, { readonly: true });
    try {
      const row = db.query(sql).get() as { npub: string } | null;
      if (!row?.npub) {
        throw new Error(
          `No active Comet account found in ${appDbPath}. Open the Comet app once to initialize it.`,
        );
      }
      return join(appDir, ACCOUNTS_DIR, row.npub, ACCOUNT_DATABASE_FILE);
    } finally {
      db.close();
    }
  }

  const { default: BetterSqlite3 } = await import("better-sqlite3");
  const db = new BetterSqlite3(appDbPath, { readonly: true }) as {
    prepare(query: string): {
      get(): { npub: string } | undefined;
    };
    close(): void;
  };
  try {
    const row = db.prepare(sql).get();
    if (!row?.npub) {
      throw new Error(
        `No active Comet account found in ${appDbPath}. Open the Comet app once to initialize it.`,
      );
    }
    return join(appDir, ACCOUNTS_DIR, row.npub, ACCOUNT_DATABASE_FILE);
  } finally {
    db.close();
  }
}
