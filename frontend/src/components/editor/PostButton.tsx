import { Note } from "&/github.com/nodetec/captains-log/db/models";
import { ListNostrKeys } from "&/github.com/nodetec/captains-log/service/nostrkeyservice";
import { ShareIcon } from "lucide-react";
import { finalizeEvent, nip19, SimplePool } from "nostr-tools";

import { Button } from "../ui/button";

type Props = {
  note: Note | undefined;
};

export function PostButton({ note }: Props) {
  const postNote = async (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    e.preventDefault();

    if (!note) {
      // TODO: show toast error
      return;
    }

    const keys = await ListNostrKeys();
    const pool = new SimplePool();

    let secretKey = nip19.decode(keys[0].Nsec).data as Uint8Array;

    let relays = ["wss://damus.io", "wss://nos.lol"];

    let event = finalizeEvent(
      {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: note.Content,
      },
      secretKey,
    );

    await Promise.any(pool.publish(relays, event));

    console.log("pk", keys[0].Npub);
  };

  return (
    <Button
      id="editor-preview-btn"
      name="editor-preview-btn"
      type="button"
      variant="ghost"
      size="icon"
      className="rounded-full text-muted-foreground"
      onClick={postNote}
    >
      <ShareIcon className="h-[1.2rem] w-[1.2rem]" />
    </Button>
  );
}
