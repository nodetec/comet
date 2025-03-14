import { useState } from "react";

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
import { usePublish } from "~/features/editor/hooks/usePublish";
import { useAppState } from "~/store";
import { SendIcon } from "lucide-react";

import { useNote } from "../hooks/useNote";

export function PublishDialog() {
  const [isOpen, setIsOpen] = useState(false);

  const keys = useAppState((state) => state.keys);
  const activeNoteId = useAppState((state) => state.activeNoteId);
  const note = useNote(activeNoteId);

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
      <DialogContent>
        <DialogHeader>
          {note.data?.identifier && note.data?.author === keys?.npub ? (
            <DialogTitle>Update Published Note</DialogTitle>
          ) : (
            <DialogTitle>Publish Note</DialogTitle>
          )}
          <DialogDescription>Publish to the nostr network.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 font-semibold">Title:</h3>
              <p className="no-scrollbar bg-secondary cursor-default overflow-x-auto rounded-md px-2 py-1">
                {note.data?.title}
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">Author:</h3>
              <p className="no-scrollbar bg-secondary cursor-default overflow-x-auto rounded-md px-2 py-1">
                {keys?.npub}
              </p>
            </div>
            {/* <div>
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
            </div> */}
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
