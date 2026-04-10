import { type RefObject } from "react";

import { Button } from "@/shared/ui/button";
import {
  DialogBackdrop,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";

export function RenameTagDialog({
  open,
  renameError,
  renameHasChanged,
  renameInputRef,
  renameInputValue,
  renameSourcePath,
  onClose,
  onInputChange,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  renameError: string | null;
  renameHasChanged: boolean;
  renameInputRef: RefObject<HTMLInputElement | null>;
  renameInputValue: string;
  renameSourcePath: string;
  onClose: () => void;
  onInputChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: { preventDefault(): void }) => void;
}) {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogPortal keepMounted={false}>
        <DialogBackdrop />
        <DialogPopup className="w-full max-w-md p-6">
          <DialogTitle className="text-base font-semibold">
            Rename Tag
          </DialogTitle>
          <DialogDescription className="mt-2">
            Rename <code>{renameSourcePath}</code> across all matching notes.
          </DialogDescription>
          <form className="mt-4 flex flex-col gap-4" onSubmit={onSubmit}>
            <label className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs font-medium">
                New Tag Path
              </span>
              <Input
                aria-invalid={renameError ? "true" : "false"}
                onChange={(event) => onInputChange(event.target.value)}
                ref={renameInputRef}
                value={renameInputValue}
              />
              {renameError ? (
                <span className="text-destructive text-xs">{renameError}</span>
              ) : null}
            </label>
            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                disabled={!renameHasChanged || !!renameError}
                type="submit"
              >
                Rename
              </Button>
            </div>
          </form>
        </DialogPopup>
      </DialogPortal>
    </DialogRoot>
  );
}
