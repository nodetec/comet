import { useQueryClient } from "@tanstack/react-query";
// import { useActiveNote } from "~/hooks/useActiveNote";
// import { useActiveUser } from "~/hooks/useActiveUser";
// import { useNoteTags } from "~/hooks/useNoteTags";
// import { useRelays } from "~/hooks/useRelays";
import { finalizeEvent, nip19 } from "nostr-tools";
// import { SimplePool } from "nostr-tools/pool";
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
  // const { data: note } = useActiveNote();
  // const { data: tags } = useNoteTags(note?.ID);
  // const { data: relays } = useRelays();
  // const { data: user } = useActiveUser();

  // const queryClient = useQueryClient();

  // const handlePublish = async (
  //   e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  //   onClose: () => void,
  // ) => {
  //   e.preventDefault();

  //   if (!note) {
  //     toast("Note failed to post", {
  //       description: "There was an error posting your note.",
  //     });
  //     return;
  //   }

  //   if (!user) {
  //     toast("Note failed to post", {
  //       description: "There was an error posting your note.",
  //     });
  //     return;
  //   }
  //   const nsec = user.Nsec;
  //   const npub = user.Npub;

  //   const pool = new SimplePool();

  //   const secretKey = nip19.decode(nsec).data as Uint8Array;

  //   let identifier;

  //   if (note.Identifier && note.Author === npub) {
  //     identifier = note.Identifier;
  //   } else {
  //     identifier = `${replaceSpacesWithDashes(note.Title)}-${randomId()}`;
  //   }

  //   const eventTags = [
  //     ["d", identifier],
  //     ["title", note.Title],
  //     ["image", `${getFirstImage(note.Content)}`], // TODO: parse first image from content
  //   ];

  //   if (tags) {
  //     tags.forEach((tag) => {
  //       eventTags.push(["t", tag.Name]);
  //     });
  //   }

  //   const event = finalizeEvent(
  //     {
  //       kind: 30023,
  //       created_at: Math.floor(Date.now() / 1000),
  //       tags: eventTags,
  //       content: note.Content,
  //     },
  //     secretKey,
  //   );

  //   console.log("event", event);

  //   try {
  //     // create list of relay ursl
  //     if (!relays) {
  //       toast("Note failed to post", {
  //         description: "There was an error posting your note.",
  //       });
  //       return;
  //     }
  //     const relayUrls = relays.map((relay) => relay.URL);

  //     console.log(event);
  //     console.log(relayUrls);

  //     await Promise.any(pool.publish(relayUrls, event));
  //     pool.close(relayUrls);

  //     // TODO: update note to published
  //     // TODO: add event id to note
  //     // TODO: add identifier to note

  //     // await AppService.SetPublishDetails(note.ID, npub, identifier);
  //     await queryClient.invalidateQueries({ queryKey: ["notes"] });
  //     await queryClient.invalidateQueries({ queryKey: ["activeNote"] });
  //     toast("Note posted", {
  //       description: "Your note was posted successfully.",
  //     });
  //     onClose();
  //   } catch (error) {
  //     console.error("Error posting note", error);
  //     toast("Note failed to post", {
  //       description: "There was an error posting your note.",
  //     });
  //   }
  // };

  // return { handlePublish };
}
