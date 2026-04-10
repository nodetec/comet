import { Button } from "@/shared/ui/button";
import {
  DialogBackdrop,
  DialogClose,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "@/shared/ui/dialog";
import { conflictDialogCopy } from "@/shared/lib/conflict-dialog-copy";

interface ConflictResolutionDialogProps {
  hasDeleteCandidate: boolean;
  open: boolean;
  pending: boolean;
  onKeepDeleted: () => void;
  onMerge: () => void;
  onOpenChange: (open: boolean) => void;
  onRestore: () => void;
}

export function ConflictResolutionDialog({
  hasDeleteCandidate,
  open,
  pending,
  onKeepDeleted,
  onMerge,
  onOpenChange,
  onRestore,
}: ConflictResolutionDialogProps) {
  const copy = conflictDialogCopy(hasDeleteCandidate);
  let restoreLabel = "Choose shown version";
  if (pending) restoreLabel = "Restoring…";
  else if (hasDeleteCandidate) restoreLabel = "Restore note";

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup className="w-full max-w-sm p-6">
          <DialogTitle className="text-base font-semibold">
            {copy.title}
          </DialogTitle>
          <p className="text-muted-foreground mt-2 text-sm">
            {copy.description}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm transition-colors">
              Cancel
            </DialogClose>
            {hasDeleteCandidate ? (
              <Button
                disabled={pending}
                onClick={onKeepDeleted}
                size="sm"
                variant="destructive"
              >
                {pending ? "Deleting…" : "Keep deleted"}
              </Button>
            ) : null}
            <Button
              disabled={pending}
              onClick={onRestore}
              size="sm"
              variant="secondary"
            >
              {restoreLabel}
            </Button>
            <Button
              disabled={pending}
              onClick={onMerge}
              size="sm"
              variant="default"
            >
              {pending ? "Merging…" : "Merge draft"}
            </Button>
          </div>
        </DialogPopup>
      </DialogPortal>
    </DialogRoot>
  );
}
