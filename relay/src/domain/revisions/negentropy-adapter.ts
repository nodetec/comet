import { createRequire } from "node:module";

import type { NegentropyItem } from "../../types";

const require = createRequire(import.meta.url);

type UpstreamNegentropyStorageVector = {
  insert: (timestamp: number, id: string) => void;
  seal: () => void;
};

type UpstreamNegentropyInstance = {
  initiate: () => Promise<string | Uint8Array>;
  reconcile: (
    msg: string | Uint8Array,
  ) => Promise<
    [
      string | Uint8Array | null,
      string[] | Uint8Array[],
      string[] | Uint8Array[],
    ]
  >;
};

export type NegentropySession = {
  initiate: () => Promise<string>;
  reconcile: (
    msg: string,
  ) => Promise<{ nextMessage: string | null; have: string[]; need: string[] }>;
};

export function createNegentropySession(
  items: readonly NegentropyItem[],
  options?: { frameSizeLimit?: number },
): NegentropySession {
  const { Negentropy: UpstreamNegentropy, NegentropyStorageVector } =
    loadNegentropyModule();
  const storage = new NegentropyStorageVector();
  for (const item of items) {
    assertHexId(item.id);
    storage.insert(item.timestamp, item.id);
  }
  storage.seal();

  const negentropy = new UpstreamNegentropy(
    storage,
    options?.frameSizeLimit ?? 0,
  );

  return {
    async initiate() {
      const initial = await negentropy.initiate();
      return normalizeMessage(initial);
    },
    async reconcile(msg) {
      const [nextMessage, have, need] = await negentropy.reconcile(msg);
      return {
        nextMessage:
          nextMessage === null ? null : normalizeMessage(nextMessage),
        have: normalizeIdList(have),
        need: normalizeIdList(need),
      };
    },
  };
}

function normalizeMessage(msg: string | Uint8Array): string {
  if (typeof msg === "string") {
    return msg;
  }
  return Buffer.from(msg).toString("hex");
}

function normalizeIdList(values: string[] | Uint8Array[]): string[] {
  return values.map((value) =>
    typeof value === "string" ? value : Buffer.from(value).toString("hex"),
  );
}

function assertHexId(id: string) {
  if (!/^[0-9a-f]{64}$/u.test(id)) {
    throw new Error(`negentropy id must be 32-byte lowercase hex: ${id}`);
  }
}

function loadNegentropyModule(): {
  Negentropy: new (
    storage: UpstreamNegentropyStorageVector,
    frameSizeLimit?: number,
  ) => UpstreamNegentropyInstance;
  NegentropyStorageVector: new () => UpstreamNegentropyStorageVector;
} {
  const moduleValue: unknown = require("../../../vendor/negentropy/Negentropy.js");
  return moduleValue as {
    Negentropy: new (
      storage: UpstreamNegentropyStorageVector,
      frameSizeLimit?: number,
    ) => UpstreamNegentropyInstance;
    NegentropyStorageVector: new () => UpstreamNegentropyStorageVector;
  };
}
