import type { CompactionStore } from "../../storage/compaction";
import type { RelaySettingsStore } from "../../storage/settings";
import type { RelayRetentionPolicy } from "../../types";

const DAY_MS = 86_400_000;

export type RetentionPolicyRuntime = {
  refresh: (options?: { runNow?: boolean }) => Promise<RelayRetentionPolicy>;
  applyPolicy: (input: {
    payloadRetentionDays?: number | null;
    compactionIntervalSeconds?: number;
  }) => Promise<{ policy: RelayRetentionPolicy; compactedSnapshots: number }>;
  stop: () => void;
};

export function createRetentionPolicyRuntime(options: {
  settings: RelaySettingsStore;
  compaction: CompactionStore;
  log?: (message: string) => void;
}): RetentionPolicyRuntime {
  let timer: Timer | null = null;

  const clearTimer = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const runCompaction = async (policy: RelayRetentionPolicy) => {
    if (policy.payloadRetentionDays === null) {
      return 0;
    }

    const cutoff = Date.now() - policy.payloadRetentionDays * DAY_MS;
    const compacted = await options.compaction.compactPayloadsBefore(cutoff);
    options.log?.(
      `retention policy ran compaction payload_retention_days=${policy.payloadRetentionDays} compacted=${compacted}`,
    );
    return compacted;
  };

  const schedule = (policy: RelayRetentionPolicy) => {
    clearTimer();

    if (policy.payloadRetentionDays === null) {
      return;
    }

    timer = setInterval(() => {
      void runCompaction(policy).catch((error) => {
        options.log?.(
          `retention policy compaction error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }, policy.compactionIntervalSeconds * 1_000);
  };

  return {
    async refresh(input = {}) {
      const policy = await options.settings.getRetentionPolicy();
      schedule(policy);
      if (input.runNow === true) {
        await runCompaction(policy);
      }
      return policy;
    },

    async applyPolicy(input) {
      const policy = await options.settings.updateRetentionPolicy(input);
      schedule(policy);
      const compactedSnapshots = await runCompaction(policy);
      return { policy, compactedSnapshots };
    },

    stop() {
      clearTimer();
    },
  };
}
