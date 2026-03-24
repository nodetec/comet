import { loadRevisionRelayConfig } from "./infra/config";
import { createRevisionRelayServer } from "./server";

async function main() {
  const config = loadRevisionRelayConfig();
  const runtime = await createRevisionRelayServer(config);

  console.log(
    `Revision relay listening on ${config.relayUrl} (port ${runtime.port})`,
  );

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down relay...`);
    await runtime.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void main();
