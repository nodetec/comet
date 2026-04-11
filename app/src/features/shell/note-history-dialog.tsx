import { format } from "date-fns";
import { History, RotateCcw, Trash2 } from "lucide-react";

import {
  DialogBackdrop,
  DialogClose,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { type NoteHistorySnapshot } from "@/shared/api/types";

type NoteHistoryDialogProps = {
  noteId: string | null;
  open: boolean;
  pending: boolean;
  selectedSnapshotId: string | null;
  snapshots: NoteHistorySnapshot[];
  hasConflict: boolean;
  onOpenChange(open: boolean): void;
  onRestore(): void;
  onSelectSnapshot(snapshotId: string): void;
};

function formatSnapshotTimestamp(mtime: number) {
  return format(mtime, "MMM d, yyyy 'at' h:mm a");
}

export function NoteHistoryDialog({
  noteId,
  open,
  pending,
  selectedSnapshotId,
  snapshots,
  hasConflict,
  onOpenChange,
  onRestore,
  onSelectSnapshot,
}: NoteHistoryDialogProps) {
  const selectedSnapshot = (() => {
    if (!selectedSnapshotId) {
      return snapshots[0] ?? null;
    }

    return (
      snapshots.find(
        (snapshot) => snapshot.snapshotId === selectedSnapshotId,
      ) ??
      snapshots[0] ??
      null
    );
  })();

  const restoreDisabled =
    pending ||
    hasConflict ||
    !selectedSnapshot ||
    selectedSnapshot.op === "del" ||
    !selectedSnapshot.markdown ||
    selectedSnapshot.isCurrent;
  let restoreLabel = "Restore";
  if (pending) {
    restoreLabel = "Restoring…";
  } else if (selectedSnapshot?.isCurrent) {
    restoreLabel = "Current";
  }
  let selectedSnapshotContent: React.ReactNode;
  if (!selectedSnapshot) {
    selectedSnapshotContent = (
      <div className="text-muted-foreground flex h-full min-h-64 items-center justify-center rounded-xl border border-dashed px-8 text-center text-sm">
        Select a retained snapshot to inspect it.
      </div>
    );
  } else if (selectedSnapshot.op === "del") {
    selectedSnapshotContent = (
      <div className="text-muted-foreground flex h-full min-h-64 items-center justify-center rounded-xl border border-dashed px-8 text-center text-sm">
        This snapshot deletes the note. Keep it for reference, or select an
        older note snapshot to restore.
      </div>
    );
  } else {
    selectedSnapshotContent = (
      <pre className="bg-muted/30 min-h-full rounded-xl border p-4 font-mono text-sm leading-6 whitespace-pre-wrap">
        {selectedSnapshot.markdown ?? ""}
      </pre>
    );
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup className="flex h-[80vh] w-[92vw] max-w-5xl overflow-hidden p-0">
          <div className="border-separator flex w-80 shrink-0 flex-col border-r">
            <div className="border-separator flex items-center justify-between border-b px-5 py-4">
              <div>
                <DialogTitle className="text-base font-semibold">
                  Snapshot history
                </DialogTitle>
                <p className="text-muted-foreground mt-1 text-sm">
                  {snapshots.length} retained snapshot
                  {snapshots.length === 1 ? "" : "s"}
                </p>
              </div>
              <History className="text-muted-foreground size-4" />
            </div>

            {snapshots.length === 0 ? (
              <div className="text-muted-foreground flex flex-1 items-center justify-center px-6 text-center text-sm">
                No retained snapshots are available for this note yet.
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                <div className="space-y-2">
                  {snapshots.map((snapshot) => {
                    const isSelected =
                      snapshot.snapshotId === selectedSnapshot?.snapshotId;

                    return (
                      <button
                        key={snapshot.snapshotId}
                        className={cn(
                          "border-separator hover:border-primary/40 hover:bg-accent/40 flex w-full flex-col gap-2 rounded-xl border px-3 py-3 text-left transition-colors",
                          isSelected && "border-primary/40 bg-accent/50",
                        )}
                        onClick={() => onSelectSnapshot(snapshot.snapshotId)}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {snapshot.title ??
                                (snapshot.op === "del"
                                  ? "Deleted snapshot"
                                  : "Untitled snapshot")}
                            </p>
                            <p className="text-muted-foreground mt-1 text-xs">
                              {formatSnapshotTimestamp(snapshot.mtime)}
                            </p>
                          </div>
                          {snapshot.op === "del" ? (
                            <Trash2 className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {snapshot.isCurrent ? (
                            <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-medium">
                              Current
                            </span>
                          ) : null}
                          {snapshot.isConflict ? (
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                              Conflict
                            </span>
                          ) : null}
                          {snapshot.op === "del" ? (
                            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium">
                              Delete
                            </span>
                          ) : null}
                        </div>
                        {snapshot.preview ? (
                          <p className="text-muted-foreground line-clamp-3 text-xs leading-5">
                            {snapshot.preview}
                          </p>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="border-separator flex items-center justify-between gap-4 border-b px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {selectedSnapshot?.title ??
                    (selectedSnapshot?.op === "del"
                      ? "Deleted snapshot"
                      : (noteId ?? "Snapshot"))}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {selectedSnapshot
                    ? formatSnapshotTimestamp(selectedSnapshot.mtime)
                    : "No snapshot selected"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <DialogClose className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm transition-colors">
                  Close
                </DialogClose>
                <Button
                  className="gap-2"
                  disabled={restoreDisabled}
                  onClick={onRestore}
                  size="sm"
                  variant="secondary"
                >
                  <RotateCcw className="size-3.5" />
                  {restoreLabel}
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {selectedSnapshotContent}
              {hasConflict ? (
                <p className="text-muted-foreground mt-4 text-xs">
                  Resolve the current conflict before restoring history.
                </p>
              ) : null}
            </div>
          </div>
        </DialogPopup>
      </DialogPortal>
    </DialogRoot>
  );
}
