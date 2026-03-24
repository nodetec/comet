import type { NostrEvent } from "@comet/nostr";

import type { GenericEventStore } from "../../storage/events";

export type PublishGenericEvent = {
  store: GenericEventStore;
  event: NostrEvent;
};

export async function publishGenericEvent(input: PublishGenericEvent) {
  return input.store.publish(input.event);
}
