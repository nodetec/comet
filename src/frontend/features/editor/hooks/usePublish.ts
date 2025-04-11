import { useQueryClient } from "@tanstack/react-query";
import { removeTitle } from "~/lib/markdown";
import { useAppState } from "~/store";
import type { Keys } from "$/types/Keys";
import type { Note } from "$/types/Note";
import { finalizeEvent, nip19, SimplePool } from "nostr-tools";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";

function randomId() {
  return uuidv4().replace(/-/g, "").substring(0, 10);
}

export function usePublish() {
  const queryClient = useQueryClient();

  const relays = useAppState((state) => state.relays);

  const handlePublish = async (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
    note: Note | undefined | null,
    keys: Keys | undefined | null,
    image: string | undefined | null,
    onClose: () => void,
  ) => {
    e.preventDefault();

    if (!note) {
      toast("Note failed to post", {
        description: "There was an error posting your note.",
      });
      return;
    }

    if (!keys) {
      toast("Note failed to post", {
        description: "There was an error posting your note.",
      });
      return;
    }
    const nsec = keys.nsec;
    const npub = keys.npub;

    const pool = new SimplePool();

    const secretKey = nip19.decode(nsec).data as Uint8Array;

    let identifier: string;

    if (note.identifier && note.author === npub) {
      identifier = note.identifier;
    } else {
      identifier = randomId();
    }

    const eventTags = [
      ["d", identifier],
      ["title", note.title],
    ];

    if (image) {
      eventTags.push(["image", image]);
    }

    if (note.tags) {
      for (const tag of note.tags) {
        eventTags.push(["t", tag]);
      }
    }

    const event = finalizeEvent(
      {
        kind: 30023,
        created_at: Math.floor(Date.now() / 1000),
        tags: eventTags,
        content: removeTitle(note.content),
      },
      secretKey,
    );

    try {
      // create list of relay urls
      if (!relays) {
        toast("Note failed to post", {
          description: "There was an error posting your note.",
        });
        return;
      }
      const relayUrls = relays.map((relay) => relay.url);

      await Promise.all(pool.publish(relayUrls, event));

      pool.close(relayUrls);

      // TODO: update note to published
      // TODO: add event address to note
      note.publishedAt = new Date().toISOString();
      note.identifier = identifier;

      await window.api.addPublishDetailsToNote(note);

      await queryClient.invalidateQueries({ queryKey: ["notes"] });
      await queryClient.invalidateQueries({ queryKey: ["note", note._id] });
      toast("Note posted", {
        description: "Your note was posted successfully.",
      });
      onClose();
    } catch (error) {
      console.error("Error posting note", error);
      toast("Note failed to post", {
        description: "There was an error posting your note.",
      });
    }
  };

  return { handlePublish };
}
