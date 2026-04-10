import { useState } from "react";
import { type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { toastErrorHandler } from "@/shared/lib/mutation-utils";
import { useShellStore } from "@/features/shell/store/use-shell-store";
import {
  deleteTag,
  loadNote,
  renameTag,
  setHideSubtagNotes,
  setTagPinned,
} from "@/shared/api/invoke";
import type { LoadedNote, WikiLinkResolutionInput } from "@/shared/api/types";
import { canonicalizeTagPath } from "@/features/editor/lib/tags";
import type { DraftControl } from "@/features/shell/hooks/use-draft-control";

export interface TagOperationsDeps {
  draftControl: DraftControl;
  currentNote: LoadedNote | undefined;
  isCurrentNoteConflicted: boolean;
  draftNoteId: string | null;
  selectedNoteId: string | null;
  activeTagPath: string | null;
  queryClient: QueryClient;
  invalidateNotes: () => Promise<void>;
  invalidateContextualTags: () => Promise<void>;
  setDraft: (
    noteId: string,
    markdown: string,
    options?: {
      preserveWikilinkResolutions?: boolean;
      wikilinkResolutions?: WikiLinkResolutionInput[];
    },
  ) => void;
  setActiveTagPath: (path: string | null) => void;
  setTagViewActive: (active: boolean) => void;
  bumpSyncEditorRevision: (
    reason: string,
    details?: Record<string, unknown>,
  ) => void;
}

export function useTagOperations(deps: TagOperationsDeps) {
  const [isTagMutationPending, setIsTagMutationPending] = useState(false);

  const syncSelectedNoteAfterTagRewrite = async (affectedNoteIds: string[]) => {
    if (
      !deps.selectedNoteId ||
      !affectedNoteIds.includes(deps.selectedNoteId)
    ) {
      await deps.queryClient.invalidateQueries({ queryKey: ["note"] });
      return;
    }

    const refreshedNote = await loadNote(deps.selectedNoteId);
    deps.queryClient.setQueryData(["note", refreshedNote.id], refreshedNote);
    deps.setDraft(refreshedNote.id, refreshedNote.markdown, {
      wikilinkResolutions: refreshedNote.wikilinkResolutions,
    });
    deps.bumpSyncEditorRevision("tag-rewrite-refresh", {
      noteId: refreshedNote.id,
      refreshedLength: refreshedNote.markdown.length,
    });
  };

  const handleRenameTag = (fromPath: string, toPath: string) => {
    if (isTagMutationPending) {
      return;
    }

    void (async () => {
      setIsTagMutationPending(true);

      try {
        if (
          deps.currentNote &&
          deps.isCurrentNoteConflicted &&
          deps.currentNote.tags.includes(fromPath)
        ) {
          toast.error(
            "Resolve the current note conflict before renaming this tag.",
            {
              id: "rename-tag-conflict-error",
            },
          );
          return;
        }

        if (
          deps.currentNote &&
          deps.draftNoteId === deps.currentNote.id &&
          deps.currentNote.tags.includes(fromPath)
        ) {
          await deps.draftControl.flushCurrentDraftAsync();
        }

        const affectedNoteIds = await renameTag({ fromPath, toPath });
        const nextPath = canonicalizeTagPath(toPath) ?? toPath;
        deps.setActiveTagPath(
          deps.activeTagPath === fromPath ? nextPath : deps.activeTagPath,
        );

        await Promise.all([
          deps.invalidateNotes(),
          deps.invalidateContextualTags(),
          syncSelectedNoteAfterTagRewrite(affectedNoteIds),
        ]);

        toast.success("Tag renamed.", { id: "rename-tag-success" });
      } catch (error) {
        toastErrorHandler("Couldn't rename tag", "rename-tag-error")(error);
      } finally {
        setIsTagMutationPending(false);
      }
    })();
  };

  const handleDeleteTag = (path: string) => {
    if (isTagMutationPending) {
      return;
    }

    void (async () => {
      setIsTagMutationPending(true);

      try {
        if (
          deps.currentNote &&
          deps.isCurrentNoteConflicted &&
          deps.currentNote.tags.includes(path)
        ) {
          toast.error(
            "Resolve the current note conflict before deleting this tag.",
            {
              id: "delete-tag-conflict-error",
            },
          );
          return;
        }

        if (
          deps.currentNote &&
          deps.draftNoteId === deps.currentNote.id &&
          deps.currentNote.tags.includes(path)
        ) {
          await deps.draftControl.flushCurrentDraftAsync();
        }

        const affectedNoteIds = await deleteTag({ path });
        if (deps.activeTagPath === path) {
          useShellStore.getState().clearActiveTagPath();
        }

        await Promise.all([
          deps.invalidateNotes(),
          deps.invalidateContextualTags(),
          syncSelectedNoteAfterTagRewrite(affectedNoteIds),
        ]);

        toast.success("Tag deleted.", { id: "delete-tag-success" });
      } catch (error) {
        toastErrorHandler("Couldn't delete tag", "delete-tag-error")(error);
      } finally {
        setIsTagMutationPending(false);
      }
    })();
  };

  const handleSetTagPinned = (path: string, pinned: boolean) => {
    if (isTagMutationPending) {
      return;
    }

    void (async () => {
      setIsTagMutationPending(true);
      try {
        await setTagPinned({ path, pinned });
        await deps.invalidateContextualTags();
      } catch (error) {
        toastErrorHandler(
          "Couldn't update tag pin",
          "set-tag-pinned-error",
        )(error);
      } finally {
        setIsTagMutationPending(false);
      }
    })();
  };

  const handleSetHideSubtagNotes = (path: string, hideSubtagNotes: boolean) => {
    if (isTagMutationPending) {
      return;
    }

    void (async () => {
      setIsTagMutationPending(true);
      try {
        await setHideSubtagNotes({ path, hideSubtagNotes });
        await Promise.all([
          deps.invalidateNotes(),
          deps.invalidateContextualTags(),
        ]);
      } catch (error) {
        toastErrorHandler(
          "Couldn't update tag visibility",
          "set-hide-subtag-notes-error",
        )(error);
      } finally {
        setIsTagMutationPending(false);
      }
    })();
  };

  return {
    isTagMutationPending,
    handleRenameTag,
    handleDeleteTag,
    handleSetTagPinned,
    handleSetHideSubtagNotes,
  };
}
