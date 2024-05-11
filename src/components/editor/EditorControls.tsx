import { signEvent } from "~/api";
import { useAppContext } from "~/store";
import { SendIcon } from "lucide-react";
import { getEventHash, Relay, type Event } from "nostr-tools";

import { Button } from "../ui/button";

export default function EditorControls() {
  const { currentNote } = useAppContext();
  async function handleSendNote(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) {
    e.preventDefault();

    const event: Event = {
      id: "",
      sig: "",
      kind: 1,
      tags: [],
      content: currentNote?.content ?? "",
      pubkey:
        "220522c2c32b3bf29006b275e224b285d64bb19f79bda906991bcb3861e18cb4",
      created_at: Math.floor(Date.now() / 1000),
    };

    const eventHash = getEventHash(event);

    event.id = eventHash;

    const signedEventStr = (await signEvent(JSON.stringify(event))) as string;

    const relay = await Relay.connect("wss://nos.lol");

    const signedEvent = JSON.parse(signedEventStr) as Event;

    await relay.publish(signedEvent);
  }

  return (
    <div className="flex gap-y-2 p-4">
      <Button onClick={handleSendNote} variant="outline" size="icon">
        <SendIcon className="h-[1.2rem] w-[1.2rem]" />
      </Button>
    </div>
  );
}
