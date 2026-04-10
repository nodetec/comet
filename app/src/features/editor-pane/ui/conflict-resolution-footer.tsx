import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { type NoteConflictInfo } from "@/shared/api/types";
import { formatConflictHeadTimestamp } from "@/features/editor-pane/lib/editor-pane-utils";

type ViewableSnapshot = NoteConflictInfo["snapshots"][number];

export function ConflictResolutionFooter({
  viewedConflictSnapshot,
  viewedConflictSnapshotIndex,
  viewableConflictSnapshots,
  isResolveConflictPending,
  readonly,
  onResolveConflict,
  onLoadConflictHead,
}: {
  viewedConflictSnapshot: ViewableSnapshot | null;
  viewedConflictSnapshotIndex: number;
  viewableConflictSnapshots: ViewableSnapshot[];
  isResolveConflictPending: boolean;
  readonly: boolean;
  onResolveConflict(): void;
  onLoadConflictHead(snapshotId: string, markdown: string | null): void;
}) {
  return (
    <div className="border-separator bg-background/95 shrink-0 border-t backdrop-blur">
      <div className="flex h-13 items-center justify-between gap-4 px-4">
        <div className="min-w-0">
          <p className="text-foreground truncate text-xs font-medium">
            {viewedConflictSnapshot?.title ??
              (viewedConflictSnapshot?.op === "del"
                ? "Deleted snapshot"
                : "Conflicting snapshot")}
          </p>
          <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-[11px]">
            <span>
              {viewedConflictSnapshot
                ? formatConflictHeadTimestamp(viewedConflictSnapshot.mtime)
                : "No previewable snapshot available"}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            className="shadow-none"
            disabled={isResolveConflictPending || readonly}
            onClick={onResolveConflict}
            size="sm"
            type="button"
            variant="default"
          >
            {isResolveConflictPending ? "Resolving…" : "Resolve"}
          </Button>
          <Button
            className="text-muted-foreground"
            disabled={viewedConflictSnapshotIndex <= 0}
            onClick={() => {
              const previousHead =
                viewedConflictSnapshotIndex > 0
                  ? viewableConflictSnapshots[viewedConflictSnapshotIndex - 1]
                  : null;
              if (previousHead) {
                onLoadConflictHead(
                  previousHead.snapshotId,
                  previousHead.markdown,
                );
              }
            }}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <ChevronLeft className="size-[1.2rem]" />
          </Button>
          <Button
            className="text-muted-foreground"
            disabled={
              viewedConflictSnapshotIndex < 0 ||
              viewedConflictSnapshotIndex >=
                viewableConflictSnapshots.length - 1
            }
            onClick={() => {
              const nextHead =
                viewedConflictSnapshotIndex >= 0 &&
                viewedConflictSnapshotIndex <
                  viewableConflictSnapshots.length - 1
                  ? viewableConflictSnapshots[viewedConflictSnapshotIndex + 1]
                  : null;
              if (nextHead) {
                onLoadConflictHead(nextHead.snapshotId, nextHead.markdown);
              }
            }}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <ChevronRight className="size-[1.2rem]" />
          </Button>
        </div>
      </div>
    </div>
  );
}
