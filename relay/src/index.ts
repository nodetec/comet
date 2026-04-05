import { loadSnapshotRelayConfig } from "./infra/config";
import { createSnapshotRelayServer } from "./server";

async function main() {
  const config = loadSnapshotRelayConfig();
  const runtime = await createSnapshotRelayServer(config);

  console.log(
    `Snapshot relay listening on ${config.relayUrl} (port ${runtime.port})`,
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
