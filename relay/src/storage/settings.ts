import { eq } from "drizzle-orm";

import type { SnapshotRelayDb } from "../db";
import type { RelayRetentionPolicy } from "../types";

import { relaySettings } from "./schema";

const SETTINGS_ROW_ID = 1;

export type RelaySettingsStore = {
  getRetentionPolicy: () => Promise<RelayRetentionPolicy>;
  updateRetentionPolicy: (input: {
    payloadRetentionDays?: number | null;
    compactionIntervalSeconds?: number;
  }) => Promise<RelayRetentionPolicy>;
};

export function createRelaySettingsStore(
  db: SnapshotRelayDb,
  defaults: {
    payloadRetentionDays: number | null;
    compactionIntervalSeconds: number;
  },
): RelaySettingsStore {
  const getRetentionPolicy = async (): Promise<RelayRetentionPolicy> => {
    const rows = await db
      .select()
      .from(relaySettings)
      .where(eq(relaySettings.id, SETTINGS_ROW_ID))
      .limit(1);

    if (rows.length === 0) {
      return {
        payloadRetentionDays: defaults.payloadRetentionDays,
        compactionIntervalSeconds: defaults.compactionIntervalSeconds,
        updatedAt: null,
      };
    }

    const row = rows[0];

    return {
      payloadRetentionDays: row.payloadRetentionDays,
      compactionIntervalSeconds: row.compactionIntervalSeconds,
      updatedAt: row.updatedAt,
    };
  };

  return {
    getRetentionPolicy,

    async updateRetentionPolicy(input) {
      const current = await getRetentionPolicy();
      const nextPayloadRetentionDays =
        input.payloadRetentionDays !== undefined
          ? input.payloadRetentionDays
          : current.payloadRetentionDays;
      const nextCompactionIntervalSeconds =
        input.compactionIntervalSeconds ?? current.compactionIntervalSeconds;
      const updatedAt = Date.now();

      await db
        .insert(relaySettings)
        .values({
          id: SETTINGS_ROW_ID,
          payloadRetentionDays: nextPayloadRetentionDays,
          compactionIntervalSeconds: nextCompactionIntervalSeconds,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: relaySettings.id,
          set: {
            payloadRetentionDays: nextPayloadRetentionDays,
            compactionIntervalSeconds: nextCompactionIntervalSeconds,
            updatedAt,
          },
        });

      return {
        payloadRetentionDays: nextPayloadRetentionDays,
        compactionIntervalSeconds: nextCompactionIntervalSeconds,
        updatedAt,
      };
    },
  };
}
