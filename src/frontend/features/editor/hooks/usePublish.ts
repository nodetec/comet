import { useQueryClient } from "@tanstack/react-query";
import { useAppState } from "~/store";
import { type Keys } from "$/types/Keys";
import { type Note } from "$/types/Note";
import { finalizeEvent, nip19, SimplePool } from "nostr-tools";
import { toast } from "sonner";

function replaceSpacesWithDashes(str: string) {
  return str.replace(/\s/g, "-");
}

function getFirstImage(markdown: string) {
  const regex = /!\[.*\]\((.*)\)/;
  const match = regex.exec(markdown);

  if (match) {
    return match[1];
  }

  return "";
}

function randomId() {
  return Math.floor(Math.random() * 0xffffffff).toString(16);
}

export function usePublish() {
  const queryClient = useQueryClient();

  const relays = useAppState((state) => state.relays);

  const handlePublish = async (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
    note: Note | undefined | null,
    keys: Keys | undefined | null,
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

    let identifier;

    if (note.identifier && note.author === npub) {
      identifier = note.identifier;
    } else {
      identifier = `${replaceSpacesWithDashes(note.title)}-${randomId()}`;
    }

    const eventTags = [
      ["d", identifier],
      ["title", note.title],
      ["image", `${getFirstImage(note.content)}`], // TODO: parse first image from content
    ];

    // TODO: add tags
    // if (tags) {
    //   tags.forEach((tag) => {
    //     eventTags.push(["t", tag.Name]);
    //   });
    // }

    const event = finalizeEvent(
      {
        kind: 30023,
        created_at: Math.floor(Date.now() / 1000),
        tags: eventTags,
        content: note.content,
      },
      secretKey,
    );

    console.log("event", event);

    try {
      // create list of relay ursl
      if (!relays) {
        toast("Note failed to post", {
          description: "There was an error posting your note.",
        });
        return;
      }
      const relayUrls = relays.map((relay) => relay.url);

      console.log(event);
      console.log(relayUrls);

      await Promise.all(pool.publish(relayUrls, event));

      pool.close(relayUrls);

      // TODO: update note to published
      // TODO: add identifier to note
      // TODO: add event address to note
      note.publishedAt = new Date();
      note.identifier = identifier;

      await window.api.addPublishDetailsToNote(note);

      await queryClient.invalidateQueries({ queryKey: ["notes"] });
      await queryClient.invalidateQueries({ queryKey: ["activeNote"] });
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
