import type { SnapshotRelayConfig } from "../types";

function parseKindList(value: string | undefined): number[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item));
}

function parseOptionalInt(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function loadSnapshotRelayConfig(
  env: NodeJS.ProcessEnv = process.env,
): SnapshotRelayConfig {
  const port = Number.parseInt(env.PORT ?? "3400", 10);
  const host = env.HOST ?? "0.0.0.0";
  const databaseUrl = env.DATABASE_URL ?? "postgres://localhost/relay";
  const relayUrl = env.RELAY_URL ?? `ws://localhost:${port}`;
  const defaultCompactionIntervalSeconds = Number.parseInt(
    env.RELAY_DEFAULT_COMPACTION_INTERVAL_SECONDS ?? "300",
    10,
  );

  return {
    port,
    host,
    databaseUrl,
    relayUrl,
    privateMode: env.PRIVATE_MODE === "true",
    adminToken: env.RELAY_ADMIN_TOKEN ?? null,
    defaultPayloadRetentionDays: parseOptionalInt(
      env.RELAY_DEFAULT_PAYLOAD_RETENTION_DAYS,
    ),
    defaultCompactionIntervalSeconds: Number.isFinite(
      defaultCompactionIntervalSeconds,
    )
      ? defaultCompactionIntervalSeconds
      : 300,
    companionKinds: parseKindList(env.REVISION_RELAY_COMPANION_KINDS),
    passThroughKinds: parseKindList(env.REVISION_RELAY_PASS_THROUGH_KINDS),
  };
}
