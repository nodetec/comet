import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

type Options = {
  count: number;
  startPort: number;
  host: string;
  adminDatabaseUrl: string;
  keepDatabases: boolean;
};

type RelayProcess = {
  name: string;
  port: number;
  wsUrl: string;
  dbName: string;
  child: ChildProcessByStdio<null, Readable, Readable>;
};

const DEFAULT_ADMIN_DATABASE_URL =
  process.env.MULTI_RELAY_ADMIN_DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  "postgres://localhost:5432/postgres";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const workspaceDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const admin = postgres(options.adminDatabaseUrl, {
    max: 1,
    onnotice: () => {},
  });
  const relays: RelayProcess[] = [];
  let shuttingDown = false;

  const cleanup = async (reason: string, exitCode: number) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    console.log(`\nShutting down multi-relay harness (${reason})...`);

    for (const relay of relays) {
      relay.child.kill("SIGTERM");
    }

    await Promise.all(
      relays.map(
        (relay) =>
          new Promise<void>((resolve) => {
            relay.child.once("exit", () => resolve());
            setTimeout(resolve, 2_000);
          }),
      ),
    );

    if (!options.keepDatabases) {
      for (const relay of relays) {
        await dropDatabase(admin, relay.dbName);
      }
    }

    await admin.end({ timeout: 5 });
    process.exit(exitCode);
  };

  process.on("SIGINT", () => {
    void cleanup("SIGINT", 0);
  });
  process.on("SIGTERM", () => {
    void cleanup("SIGTERM", 0);
  });

  try {
    for (let index = 0; index < options.count; index += 1) {
      const port = options.startPort + index;
      const name = `relay-${index + 1}`;
      const dbName = `relay_dev_${port}_${Date.now()}_${process.pid}`;
      await createDatabase(admin, dbName);

      const wsUrl = `ws://${options.host}:${port}/ws`;
      const child = spawn("bun", ["run", "src/index.ts"], {
        cwd: workspaceDir,
        env: {
          ...process.env,
          HOST: options.host,
          PORT: `${port}`,
          DATABASE_URL: databaseUrlFor(options.adminDatabaseUrl, dbName),
          RELAY_URL: wsUrl,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      pipeOutput(name, child.stdout);
      pipeOutput(name, child.stderr);

      child.once("exit", (code, signal) => {
        if (!shuttingDown) {
          console.error(
            `[${name}] exited unexpectedly code=${code ?? "null"} signal=${signal ?? "null"}`,
          );
          void cleanup(`${name} exited unexpectedly`, 1);
        }
      });

      await waitForHealthz(`http://${options.host}:${port}/healthz`);

      relays.push({
        name,
        port,
        wsUrl,
        dbName,
        child,
      });
    }

    console.log("\nRevision relay cluster ready:\n");
    for (const relay of relays) {
      console.log(
        `${relay.name.padEnd(7)} ws=${relay.wsUrl} db=${relay.dbName}`,
      );
    }
    console.log("");
    console.log(
      `Sync relays: ${relays.map((relay) => relay.wsUrl).join(", ")}`,
    );
    console.log("Press Ctrl+C to stop and clean up.");
  } catch (error) {
    console.error(
      `Failed to start multi-relay harness: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    await cleanup("startup failure", 1);
  }
}

function parseArgs(args: string[]): Options {
  let count = 3;
  let startPort = 3400;
  let host = "127.0.0.1";
  let adminDatabaseUrl = DEFAULT_ADMIN_DATABASE_URL;
  let keepDatabases = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--count":
        count = parseIntegerArg(arg, args[index + 1]);
        index += 1;
        break;
      case "--start-port":
        startPort = parseIntegerArg(arg, args[index + 1]);
        index += 1;
        break;
      case "--host":
        host = args[index + 1] ?? host;
        index += 1;
        break;
      case "--admin-db":
        adminDatabaseUrl = args[index + 1] ?? adminDatabaseUrl;
        index += 1;
        break;
      case "--keep-databases":
        keepDatabases = true;
        break;
      case "--help":
      case "-h":
        printHelpAndExit();
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (count < 1) {
    throw new Error("--count must be at least 1");
  }

  return {
    count,
    startPort,
    host,
    adminDatabaseUrl,
    keepDatabases,
  };
}

function parseIntegerArg(flag: string, value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${flag} requires an integer value`);
  }
  return parsed;
}

function printHelpAndExit(): never {
  console.log(`Usage: bun run src/dev/multi-relay.ts [options]

Options:
  --count <n>        Number of relays to start (default: 3)
  --start-port <n>   Starting port (default: 3400)
  --host <host>      Host interface (default: 127.0.0.1)
  --admin-db <url>   Admin Postgres URL used to create/drop relay DBs
  --keep-databases   Leave created databases in place on shutdown
`);
  process.exit(0);
}

function pipeOutput(name: string, stream: NodeJS.ReadableStream) {
  const lineReader = readline.createInterface({ input: stream });
  lineReader.on("line", (line) => {
    console.log(`[${name}] ${line}`);
  });
}

function databaseUrlFor(baseUrl: string, databaseName: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function createDatabase(admin: postgres.Sql, databaseName: string) {
  assertSafeDatabaseName(databaseName);
  await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
}

async function dropDatabase(admin: postgres.Sql, databaseName: string) {
  assertSafeDatabaseName(databaseName);
  await admin`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = ${databaseName} AND pid <> pg_backend_pid()
  `;
  await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
}

function assertSafeDatabaseName(databaseName: string) {
  if (!/^[a-z0-9_]+$/u.test(databaseName)) {
    throw new Error(`unsafe database name: ${databaseName}`);
  }
}

async function waitForHealthz(url: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await Bun.sleep(100);
  }

  throw new Error(`relay did not become healthy: ${url}`);
}

void main();
