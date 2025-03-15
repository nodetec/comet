import { useState } from "react";

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
import { ScrollArea } from "~/components/ui/scroll-area";
import { usePublish } from "~/features/editor/hooks/usePublish";
import { useAppState } from "~/store";
import { SendIcon } from "lucide-react";

import { useNote } from "../hooks/useNote";

export function PublishDialog() {
  const [isOpen, setIsOpen] = useState(false);

  const keys = useAppState((state) => state.keys);
  const activeNoteId = useAppState((state) => state.activeNoteId);
  const note = useNote(activeNoteId);

  const previewImage = note.data?.content.match(/!\[.*\]\((.*)\)/);

  const { handlePublish } = usePublish();

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {keys?.npub && (
          <Button type="button" variant="ghost" size="icon">
            <SendIcon />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="border-accent h-[85%] max-h-[50rem] w-[90%] max-w-[40rem] overflow-hidden overflow-y-scroll border select-none">
        <DialogHeader>
          {note.data?.identifier ? (
            <DialogTitle>Update Note</DialogTitle>
          ) : (
            <DialogTitle>Publish Note</DialogTitle>
          )}
          <DialogDescription>Publish to the nostr network.</DialogDescription>
        </DialogHeader>

        <div className="my-4 flex flex-col gap-4">
          {previewImage && (
            <div className="border-accent max-w-md rounded-md border">
              <img
                src={previewImage ? previewImage[1] : ""}
                alt="preview"
                className="h-full w-full rounded-md object-contain"
              />
            </div>
          )}

          <div className="space-y-4">
            <div>
              <h3 className="mb-2 font-semibold">Title:</h3>
              <p className="no-scrollbar bg-accent cursor-default overflow-x-auto rounded-md px-2 py-1">
                {note.data?.title}
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">Author:</h3>
              <p className="no-scrollbar bg-accent cursor-default overflow-x-auto rounded-md px-2 py-1">
                {keys?.npub}
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">Tags:</h3>
              <div className="flex flex-wrap gap-2">
                {note.data?.tags.map((tag, index) => (
                  <Badge
                    className="cursor-default"
                    key={index}
                    variant="accent"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>

          <Button
            onClick={(e) =>
              handlePublish(e, note.data, keys, () => setIsOpen(false))
            }
          >
            Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
