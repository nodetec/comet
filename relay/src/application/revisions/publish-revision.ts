import type { RevisionStore } from "../../storage/revisions";
import type { RevisionEnvelope } from "../../types";

export type PublishRevision = {
  store: RevisionStore;
  envelope: RevisionEnvelope;
};

export async function publishRevision(input: PublishRevision) {
  return input.store.insertRevision(input.envelope);
}
