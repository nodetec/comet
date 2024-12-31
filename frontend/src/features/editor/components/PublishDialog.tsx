import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { AppService } from "&/comet/backend/service";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { useActiveNote } from "~/hooks/useActiveNote";
import { useActiveUser } from "~/hooks/useActiveUser";
import { useNoteTags } from "~/hooks/useNoteTags";
import { useRelays } from "~/hooks/useRelays";
import { SendHorizonalIcon } from "lucide-react";
import { finalizeEvent, nip19 } from "nostr-tools";
import { SimplePool } from "nostr-tools/pool";
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

export function PublishDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const { data: note } = useActiveNote();
  const { data: tags } = useNoteTags(note?.ID);
  const { data: relays } = useRelays();
  const { data: user } = useActiveUser();

  const queryClient = useQueryClient();

  const handlePublish = async (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    e.preventDefault();

    if (!note) {
      toast("Note failed to post", {
        description: "There was an error posting your note.",
      });
      return;
    }

    if (!user) {
      toast("Note failed to post", {
        description: "There was an error posting your note.",
      });
      return;
    }
    const nsec = user.Nsec;
    const npub = user.Npub;

    const pool = new SimplePool();

    const secretKey = nip19.decode(nsec).data as Uint8Array;

    const identifier = `${replaceSpacesWithDashes(note.Title)}-${randomId()}`;

    const event = finalizeEvent(
      {
        kind: 30023,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["d", identifier],
          ["title", note.Title],
          ["image", `${getFirstImage(note.Content)}`], // TODO: parse first image from content
        ],
        content: note.Content,
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
      const relayUrls = relays.map((relay) => relay.URL);

      console.log(event);
      console.log(relayUrls);

      await Promise.any(pool.publish(relayUrls, event));
        pool.close(relayUrls);

      // TODO: update note to published
      // TODO: add event id to note
      // TODO: add identifier to note

      await AppService.SetPublishDetails(note.ID, npub, identifier, "");
      await queryClient.invalidateQueries({ queryKey: ["notes"] });
      await queryClient.invalidateQueries({ queryKey: ["activeNote"] });
      setIsOpen(false);
      toast("Note posted", {
        description: "Your note was posted successfully.",
      });
    } catch (error) {
      toast("Note failed to post", {
        description: "There was an error posting your note.",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {user && (
          <Button type="button" variant="ghost" size="icon">
            <SendHorizonalIcon />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish Note</DialogTitle>
          <DialogDescription>Publish to the nostr network.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 font-semibold">Title:</h3>
              <p className="no-scrollbar cursor-default overflow-x-auto rounded-md bg-secondary px-2 py-1">
                {note?.Title}
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">Author:</h3>
              <p className="no-scrollbar cursor-default overflow-x-auto rounded-md bg-secondary px-2 py-1">
                {user?.Npub}
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">Tags:</h3>
              <div className="flex flex-wrap gap-2">
                {tags?.map((tag, index) => (
                  <Badge
                    className="cursor-default"
                    key={index}
                    variant="secondary"
                  >
                    {tag.Name}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          {/* {previewContent && (
            <Card className="h-[300px] overflow-auto">
              <CardContent className="p-4">
                <h3 className="mb-2 font-semibold">Preview</h3>
                <p className="text-sm text-muted-foreground">
                  {previewContent}
                </p>
              </CardContent>
            </Card>
          )} */}
        </div>
        {/* <div className="flex justify-end space-x-2">
          <Button>Publish</Button>
        </div> */}

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handlePublish}>Publish</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
