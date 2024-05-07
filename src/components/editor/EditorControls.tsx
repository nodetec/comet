import { useQueryClient } from "@tanstack/react-query";
import { signEvent, updateNote } from "~/api";
import { useAppContext } from "~/store";
import { SaveIcon, SendIcon } from "lucide-react";
import {
  Event,
  EventTemplate,
  getEventHash,
  Relay,
  UnsignedEvent,
} from "nostr-tools";

import { Button } from "../ui/button";

export default function EditorControls() {
  const { currentNote, setCurrentNote, setCurrentTrashedNote } =
    useAppContext();
  const queryClient = useQueryClient();
  async function handleSaveNote(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) {
    e.preventDefault();
    const content = currentNote?.content;
    const id = currentNote?.id;
    if (id === undefined || content === undefined) {
      return;
    }
    const apiResponse = await updateNote({ id, content });

    setCurrentNote(apiResponse.data);
    setCurrentTrashedNote(undefined);

    void queryClient.invalidateQueries({ queryKey: ["notes"] });
  }
  async function handleSendNote(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) {
    e.preventDefault();

    const t: UnsignedEvent = {
      kind: 1,
      tags: [],
      content: currentNote?.content ?? "",
      pubkey:
        "220522c2c32b3bf29006b275e224b285d64bb19f79bda906991bcb3861e18cb4",
      created_at: Math.floor(Date.now() / 1000),
    };

    const eventHash = getEventHash(t);

    t.id = eventHash;

    const signedEvent = (await signEvent(JSON.stringify(t))) as string;

    const relay = await Relay.connect("wss://nos.lol");

    console.log(signedEvent);

    await relay.publish(JSON.parse(signedEvent));
  }

  return (
    <div className="flex gap-y-2 p-4">
      <Button onClick={handleSendNote} variant="outline" size="icon">
        <SendIcon className="h-[1.2rem] w-[1.2rem]" />
      </Button>
    </div>
  );
}
