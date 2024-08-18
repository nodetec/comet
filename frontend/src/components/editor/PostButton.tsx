import { Note } from "&/github.com/nodetec/captains-log/db/models";
import { ListNostrKeys } from "&/github.com/nodetec/captains-log/service/nostrkeyservice";
import { ShareIcon } from "lucide-react";
import { finalizeEvent, nip19, SimplePool } from "nostr-tools";

import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";

type Props = {
  note: Note | undefined;
};

function randomId() {
  // @ts-ignore
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11)
    .replace(/[018]/g, (c: any) =>
      (
        c ^
        (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
      ).toString(16),
    )
    .slice(0, 8);
}

function getFirstImage(markdown: string) {
  const regex = /!\[.*\]\((.*)\)/;
  const match = markdown.match(regex);

  if (match) {
    return match[1];
  }

  return "";
}

function replaceSpacesWithDashes(str: string) {
  return str.replace(/\s/g, "-");
}

// TODO: publish event
// set published to true
// when try to publish again, ask if want to update or create new
// should probably save d value in the db, can look up by d value

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

    let relays = ["wss://relay.notestack.com"];

    let event = finalizeEvent(
      {
        kind: 30023,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["d", `${replaceSpacesWithDashes(note.Title)}-${randomId()}`],
          ["title", note.Title],
          ["image", `${getFirstImage(note.Content)}`], // TODO: parse first image from content
        ],
        content: note.Content,
      },
      secretKey,
    );

    console.log("event", event);

    await Promise.any(pool.publish(relays, event));

    console.log("pk", keys[0].Npub);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          id="editor-preview-btn"
          name="editor-preview-btn"
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          // onClick={postNote}
        >
          <ShareIcon className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you sure?</DialogTitle>
          <DialogDescription className="flex min-h-24 flex-col justify-center">
            Are you sure you want to post this article?
            <Button
              type="button"
              variant="default"
              size="sm"
              className="mt-4 w-16"
              onClick={postNote}
            >
              Post
            </Button>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
