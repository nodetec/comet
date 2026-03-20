import { createRelayServer } from "./server";

const runtime = await createRelayServer();

console.log(
  `Comet relay listening on ${runtime.relayUrl}${runtime.access.privateMode ? " (private mode)" : ""}`,
);

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down relay...`);
  await runtime.stop();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
