import type { SnapshotStore } from "../../storage/snapshots";
import type { SnapshotEnvelope } from "../../types";

export type PublishRevision = {
  store: SnapshotStore;
  envelope: SnapshotEnvelope;
};

export async function publishSnapshot(input: PublishRevision) {
  return input.store.insertSnapshot(input.envelope);
}
