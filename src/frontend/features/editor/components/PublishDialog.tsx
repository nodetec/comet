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
import { Input } from "~/components/ui/input";
import { usePublish } from "~/features/editor/hooks/usePublish";
import { useAppState } from "~/store";
import { SendIcon } from "lucide-react";

import { useNote } from "../hooks/useNote";
import { useQueryClient } from "@tanstack/react-query";

export function PublishDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>("");

  const keys = useAppState((state) => state.keys);
  const note = useNote();

  const queryClient = useQueryClient();

  const { handlePublish } = usePublish();

  const onClick = () => {
    queryClient.invalidateQueries({
      queryKey: ["note", note.data?._id],
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {keys?.npub && (
          <Button onClick={onClick} type="button" variant="ghost" size="icon">
            <SendIcon />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="h-[85%] max-h-[50rem] w-[90%] max-w-[40rem] select-none overflow-hidden overflow-y-scroll border border-accent">
        <DialogHeader>
          {note.data?.identifier ? (
            <DialogTitle>Update Note</DialogTitle>
          ) : (
            <DialogTitle>Publish Note</DialogTitle>
          )}
          <DialogDescription>Publish to the nostr network.</DialogDescription>
        </DialogHeader>

        <div className="mb-4 flex flex-col gap-4">
          {imageUrl && (
            <div className="max-w-md rounded-md">
              <img
                src={imageUrl}
                alt="preview"
                className="h-auto w-auto rounded-md border border-accent object-contain"
              />
            </div>
          )}

          <div className="space-y-4">
            <div>
              <h3 className="mb-2 font-semibold">Image URL:</h3>
              <Input
                type="url"
                placeholder="Enter image URL"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="w-full"
              />
            </div>

            <div>
              <h3 className="mb-2 font-semibold">Title:</h3>
              <p className="no-scrollbar cursor-default overflow-x-auto rounded-md bg-accent px-2 py-1">
                {note.data?.title}
              </p>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">Author:</h3>
              <p className="no-scrollbar cursor-default overflow-x-auto rounded-md bg-accent px-2 py-1">
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
              handlePublish(e, note.data, keys, imageUrl || undefined, () =>
                setIsOpen(false),
              )
            }
          >
            Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
