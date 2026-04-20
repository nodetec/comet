import { Button } from "@/shared/ui/button";
import {
  DialogBackdrop,
  DialogClose,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "@/shared/ui/dialog";

interface DeletePublishDialogProps {
  open: boolean;
  pending: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

export function DeletePublishDialog({
  open,
  pending,
  onConfirm,
  onOpenChange,
}: DeletePublishDialogProps) {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup className="w-full max-w-sm p-6">
          <DialogTitle className="text-base font-semibold">
            Delete from Nostr?
          </DialogTitle>
          <p className="text-muted-foreground mt-2 text-sm">
            This will request relays to delete the published note. Relays may
            not honor the request, and copies may still exist elsewhere.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm transition-colors">
              Cancel
            </DialogClose>
            <Button
              disabled={pending}
              onClick={onConfirm}
              size="sm"
              variant="destructive"
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </DialogPopup>
      </DialogPortal>
    </DialogRoot>
  );
}
