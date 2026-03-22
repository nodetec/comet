import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { closeDatabase, openDatabase } from "./db";
import { resolveAppDatabasePath } from "./lib/paths";
import { createServer } from "./server";

const args = process.argv.slice(2);
const dev = args.includes("--dev");

let appDbPath: string;
try {
  appDbPath = resolveAppDatabasePath(dev);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}

try {
  await openDatabase(appDbPath);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}

const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.error(`Received ${signal}, shutting down comet-mcp...`);
  closeDatabase();
  process.exit(0);
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
