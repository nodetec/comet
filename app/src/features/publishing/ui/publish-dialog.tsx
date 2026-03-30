import { useState, type KeyboardEvent } from "react";
import { Lock, X } from "lucide-react";

import {
  normalizePublishTag,
  normalizePublishTags,
} from "@/features/publishing/lib/tags";
import { Button } from "@/shared/ui/button";
import {
  DialogBackdrop,
  DialogClose,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";

import type {
  PublishNoteInput,
  PublishShortNoteInput,
} from "@/shared/api/types";
import {
  hasAttachmentReferences,
  isAttachmentUri,
} from "@/shared/lib/attachments";

function useTagEditor(initialTags: string[]) {
  const [tags, setTags] = useState<string[]>(() =>
    normalizePublishTags(initialTags),
  );
  const [tagInput, setTagInput] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);

  const addTag = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setTagInput("");
      setTagError(null);
      return;
    }

    const tag = normalizePublishTag(trimmed);
    if (!tag) {
      setTagError("Enter a valid tag path.");
      return;
    }

    if (!tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput("");
    setTagError(null);
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
    setTagError(null);
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

  return {
    tags,
    tagInput,
    tagError,
    setTagInput,
    setTagError,
    addTag,
    removeTag,
    handleTagKeyDown,
  };
}

type PublishDialogProps = {
  content: string;
  initialTitle: string;
  initialTags: string[];
  noteId: string;
  open: boolean;
  pending: boolean;
  onOpenChange(open: boolean): void;
  onSubmit(input: PublishNoteInput): void;
};

export function PublishDialog({
  content,
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
          content={content}
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
  content,
  initialTitle,
  initialTags,
  noteId,
  pending,
  onSubmit,
}: Omit<PublishDialogProps, "open" | "onOpenChange">) {
  const [title, setTitle] = useState(initialTitle);
  const [image, setImage] = useState("");
  const {
    tags,
    tagInput,
    tagError,
    setTagInput,
    setTagError,
    addTag,
    removeTag,
    handleTagKeyDown,
  } = useTagEditor(initialTags);
  const hasLocalAttachmentImages = hasAttachmentReferences(content);
  const hasAttachmentCoverImage = isAttachmentUri(image.trim());
  const publishBlocked = hasLocalAttachmentImages || hasAttachmentCoverImage;

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
        Publish Article
      </DialogTitle>

      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs font-medium">
            Title
          </span>
          <Input
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
          <Input
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
              autoCapitalize="off"
              className="min-w-[80px] flex-1 bg-transparent py-0.5 text-sm outline-none"
              onChange={(e) => {
                setTagInput(e.target.value);
                setTagError(null);
              }}
              onKeyDown={handleTagKeyDown}
              onBlur={() => {
                if (tagInput.trim()) addTag(tagInput);
              }}
              placeholder={tags.length === 0 ? "Add tags…" : ""}
              type="text"
              value={tagInput}
            />
          </div>
          {tagError ? (
            <p className="text-destructive text-xs">{tagError}</p>
          ) : null}
        </div>
      </div>

      <div className="bg-muted/50 mt-4 rounded-md border px-3 py-2.5">
        <p className="text-muted-foreground text-xs">
          Only inline markdown images with remote URLs will work. Local attached
          images and <code>attachment://</code> cover images can&apos;t be
          published yet.
        </p>
        {publishBlocked ? (
          <p className="text-destructive mt-1 text-xs">
            Remove local attached images before publishing this note.
          </p>
        ) : null}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <DialogClose className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm transition-colors">
          Cancel
        </DialogClose>
        <Button
          disabled={pending || publishBlocked || !!tagError}
          onClick={handleSubmit}
          size="sm"
        >
          {pending ? "Publishing…" : "Publish"}
        </Button>
      </div>
    </DialogPopup>
  );
}

// ── Publish Short Note (kind 1) dialog ────────────────────────────────

const LOCK_WARNING =
  "This note will be locked after publishing. Short notes can't be edited on Nostr — you can only delete and republish.";

type PublishShortNoteDialogProps = {
  content: string;
  initialTags: string[];
  noteId: string;
  open: boolean;
  pending: boolean;
  onOpenChange(open: boolean): void;
  onSubmit(input: PublishShortNoteInput): void;
};

export function PublishShortNoteDialog({
  content,
  initialTags,
  noteId,
  open,
  pending,
  onOpenChange,
  onSubmit,
}: PublishShortNoteDialogProps) {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogPortal keepMounted={false}>
        <DialogBackdrop />
        <PublishShortNoteDialogContent
          key={noteId}
          content={content}
          initialTags={initialTags}
          noteId={noteId}
          pending={pending}
          onSubmit={onSubmit}
        />
      </DialogPortal>
    </DialogRoot>
  );
}

function PublishShortNoteDialogContent({
  content,
  initialTags,
  noteId,
  pending,
  onSubmit,
}: Omit<PublishShortNoteDialogProps, "open" | "onOpenChange">) {
  const {
    tags,
    tagInput,
    tagError,
    setTagInput,
    setTagError,
    addTag,
    removeTag,
    handleTagKeyDown,
  } = useTagEditor(initialTags);
  const hasLocalAttachmentImages = hasAttachmentReferences(content);

  const handleSubmit = () => {
    onSubmit({ noteId, tags });
  };

  return (
    <DialogPopup className="w-full max-w-md p-6">
      <DialogTitle className="text-base font-semibold">
        Publish Note
      </DialogTitle>

      <div className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs font-medium">
            Preview
          </span>
          <div className="bg-muted/50 max-h-48 overflow-y-auto rounded-md border px-3 py-2 text-sm whitespace-pre-wrap">
            {content || "No content"}
          </div>
        </div>

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
              autoCapitalize="off"
              className="min-w-[80px] flex-1 bg-transparent py-0.5 text-sm outline-none"
              onChange={(e) => {
                setTagInput(e.target.value);
                setTagError(null);
              }}
              onKeyDown={handleTagKeyDown}
              onBlur={() => {
                if (tagInput.trim()) addTag(tagInput);
              }}
              placeholder={tags.length === 0 ? "Add tags…" : ""}
              type="text"
              value={tagInput}
            />
          </div>
          {tagError ? (
            <p className="text-destructive text-xs">{tagError}</p>
          ) : null}
        </div>
      </div>

      <div className="bg-muted/50 mt-4 flex items-start gap-2 rounded-md border px-3 py-2.5">
        <Lock className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
        <p className="text-muted-foreground text-xs">{LOCK_WARNING}</p>
      </div>

      <div className="bg-muted/50 mt-4 rounded-md border px-3 py-2.5">
        <p className="text-muted-foreground text-xs">
          Only inline markdown images with remote URLs will work. Local attached
          images can&apos;t be published yet.
        </p>
        {hasLocalAttachmentImages ? (
          <p className="text-destructive mt-1 text-xs">
            Remove local attached images before publishing this note.
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <DialogClose className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm transition-colors">
          Cancel
        </DialogClose>
        <Button
          disabled={pending || hasLocalAttachmentImages || !!tagError}
          onClick={handleSubmit}
          size="sm"
        >
          {pending ? "Publishing…" : "Publish"}
        </Button>
      </div>
    </DialogPopup>
  );
}
