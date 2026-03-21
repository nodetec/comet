import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const APP_IDENTIFIER = "md.comet-alpha";
const DEV_IDENTIFIER = "md.comet-alpha.dev";
const DATABASE_FILE = "comet.db";

export function resolveDatabasePath(dev: boolean): string {
  const envPath = process.env["COMET_DB_PATH"];
  if (envPath) {
    if (!existsSync(envPath)) {
      throw new Error(`COMET_DB_PATH does not exist: ${envPath}`);
    }
    return envPath;
  }

  const identifier = dev ? DEV_IDENTIFIER : APP_IDENTIFIER;
  const home = homedir();
  const os = platform();

  let configDir: string;
  if (os === "darwin") {
    configDir = join(home, "Library", "Application Support", identifier);
  } else if (os === "win32") {
    const appdata = process.env["APPDATA"] ?? join(home, "AppData", "Roaming");
    configDir = join(appdata, identifier);
  } else {
    configDir = join(
      process.env["XDG_CONFIG_HOME"] ?? join(home, ".config"),
      identifier,
    );
  }

  const dbPath = join(configDir, DATABASE_FILE);
  if (!existsSync(dbPath)) {
    throw new Error(
      `Comet database not found at ${dbPath}. Make sure the Comet app has been run at least once.`,
    );
  }

  return dbPath;
}
