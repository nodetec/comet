import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DialogBackdrop,
  DialogClose,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";

import type { PublishNoteInput } from "./types";

type PublishDialogProps = {
  initialTitle: string;
  initialTags: string[];
  noteId: string;
  open: boolean;
  pending: boolean;
  onOpenChange(open: boolean): void;
  onSubmit(input: PublishNoteInput): void;
};

export function PublishDialog({
  initialTitle,
  initialTags,
  noteId,
  open,
  pending,
  onOpenChange,
  onSubmit,
}: PublishDialogProps) {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogPortal keepMounted={false}>
        <DialogBackdrop />
        <PublishDialogContent
          key={noteId}
          initialTitle={initialTitle}
          initialTags={initialTags}
          noteId={noteId}
          pending={pending}
          onSubmit={onSubmit}
        />
      </DialogPortal>
    </DialogRoot>
  );
}

function PublishDialogContent({
  initialTitle,
  initialTags,
  noteId,
  pending,
  onSubmit,
}: Omit<PublishDialogProps, "open" | "onOpenChange">) {
  const [title, setTitle] = useState(initialTitle);
  const [image, setImage] = useState("");
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagInput, setTagInput] = useState("");

  const addTag = (raw: string) => {
    const tag = raw.trim().replace(/^#/, "").trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(tagInput);
    } else if (
      event.key === "Backspace" &&
      tagInput === "" &&
      tags.length > 0
    ) {
      setTags(tags.slice(0, -1));
    }
  };

  const handleSubmit = () => {
    onSubmit({
      noteId,
      title: title.trim() || initialTitle,
      image: image.trim() || null,
      tags,
    });
  };

  return (
    <DialogPopup className="w-full max-w-md p-6">
      <DialogTitle className="text-base font-semibold">
        Publish to Nostr
      </DialogTitle>

      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs font-medium">
            Title
          </span>
          <input
            className="border-input bg-background focus:ring-ring rounded-md border px-3 py-2 text-sm outline-none focus:ring-1"
            onChange={(e) => setTitle(e.target.value)}
            placeholder={initialTitle}
            type="text"
            value={title}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs font-medium">
            Cover Image URL
          </span>
          <input
            className="border-input bg-background focus:ring-ring rounded-md border px-3 py-2 text-sm outline-none focus:ring-1"
            onChange={(e) => setImage(e.target.value)}
            placeholder="https://…"
            type="url"
            value={image}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs font-medium">
            Tags
          </span>
          <div className="border-input bg-background focus-within:ring-ring flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 focus-within:ring-1">
            {tags.map((tag) => (
              <button
                className="bg-accent text-accent-foreground hover:bg-accent/70 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs transition-colors"
                key={tag}
                onClick={() => removeTag(tag)}
                type="button"
              >
                {tag}
                <X className="size-3" />
              </button>
            ))}
            <input
              className="min-w-[80px] flex-1 bg-transparent py-0.5 text-sm outline-none"
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={() => {
                if (tagInput.trim()) addTag(tagInput);
              }}
              placeholder={tags.length === 0 ? "Add tags…" : ""}
              type="text"
              value={tagInput}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <DialogClose className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm transition-colors">
          Cancel
        </DialogClose>
        <Button disabled={pending} onClick={handleSubmit} size="sm">
          {pending ? "Publishing…" : "Publish"}
        </Button>
      </div>
    </DialogPopup>
  );
}
