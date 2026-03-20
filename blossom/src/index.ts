import { createBlossomServer } from "./server";

const runtime = await createBlossomServer();

console.log(
  `Comet Blossom listening on http://localhost:${runtime.port} -> ${runtime.objectStorage.publicBaseUrl}`,
);

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Received ${signal}, shutting down blossom...`);
  await runtime.stop();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
