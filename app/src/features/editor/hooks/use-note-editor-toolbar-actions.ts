import { useCallback } from "react";
import { EditorSelection } from "@codemirror/state";
import { type EditorView } from "@codemirror/view";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";

import {
  cycleBlockType,
  insertCodeBlock,
  insertMarkdownImage,
  insertMarkdownTable,
  toggleInlineFormat,
  type InlineFormat,
  type SelectionSnapshot,
} from "@/features/editor/lib/toolbar-state";
import {
  IMAGE_EXTENSIONS,
  importImage,
  unresolveImageSrc,
} from "@/shared/lib/attachments";

function focusEditorViewWithoutScroll(view: EditorView) {
  try {
    view.contentDOM.focus({ preventScroll: true });
  } catch {
    view.focus();
  }
}

function getContiguousMarkdownChange(
  currentMarkdown: string,
  nextMarkdown: string,
) {
  let start = 0;
  const maxStart = Math.min(currentMarkdown.length, nextMarkdown.length);
  while (
    start < maxStart &&
    currentMarkdown.codePointAt(start) === nextMarkdown.codePointAt(start)
  ) {
    start += 1;
  }

  let currentEnd = currentMarkdown.length;
  let nextEnd = nextMarkdown.length;
  while (
    currentEnd > start &&
    nextEnd > start &&
    currentMarkdown.codePointAt(currentEnd - 1) ===
      nextMarkdown.codePointAt(nextEnd - 1)
  ) {
    currentEnd -= 1;
    nextEnd -= 1;
  }

  return {
    from: start,
    insert: nextMarkdown.slice(start, nextEnd),
    to: currentEnd,
  };
}

export interface UseNoteEditorToolbarActionsParams {
  readOnly: boolean;
  viewRef: { current: EditorView | null };
}

export function useNoteEditorToolbarActions({
  readOnly,
  viewRef,
}: UseNoteEditorToolbarActionsParams) {
  const applyToolbarMutation = useCallback(
    (
      transform: (
        markdown: string,
        selection: SelectionSnapshot,
      ) => {
        markdown: string;
        selection: SelectionSnapshot;
      },
    ) => {
      const view = viewRef.current;
      if (!view || readOnly) {
        return false;
      }

      const currentMarkdown = view.state.doc.toString();
      const currentSelection = view.state.selection.main;
      const next = transform(currentMarkdown, {
        anchor: currentSelection.anchor,
        head: currentSelection.head,
      });

      if (
        next.markdown === currentMarkdown &&
        next.selection.anchor === currentSelection.anchor &&
        next.selection.head === currentSelection.head
      ) {
        focusEditorViewWithoutScroll(view);
        return false;
      }

      const change = getContiguousMarkdownChange(
        currentMarkdown,
        next.markdown,
      );

      view.dispatch({
        changes: change,
        selection: EditorSelection.range(
          next.selection.anchor,
          next.selection.head,
        ),
        scrollIntoView: false,
      });
      focusEditorViewWithoutScroll(view);
      return true;
    },
    [readOnly, viewRef],
  );

  const handleToggleInlineFormat = useCallback(
    (format: InlineFormat) => {
      applyToolbarMutation((currentMarkdown, selection) =>
        toggleInlineFormat(currentMarkdown, selection, format),
      );
    },
    [applyToolbarMutation],
  );

  const handleCycleBlockType = useCallback(() => {
    applyToolbarMutation(cycleBlockType);
  }, [applyToolbarMutation]);

  const handleInsertCodeBlock = useCallback(() => {
    applyToolbarMutation(insertCodeBlock);
  }, [applyToolbarMutation]);

  const handleInsertTable = useCallback(() => {
    applyToolbarMutation(insertMarkdownTable);
  }, [applyToolbarMutation]);

  const handleInsertImage = useCallback(async () => {
    if (readOnly) {
      return;
    }

    const sourcePath = await openFileDialog({
      filters: [
        {
          extensions: IMAGE_EXTENSIONS,
          name: "Images",
        },
      ],
      multiple: false,
    });

    if (typeof sourcePath !== "string") {
      return;
    }

    const imported = await importImage(sourcePath);
    const src = unresolveImageSrc(imported.assetUrl);
    applyToolbarMutation((currentMarkdown, selection) =>
      insertMarkdownImage(currentMarkdown, selection, {
        altText: imported.altText,
        src,
      }),
    );
  }, [applyToolbarMutation, readOnly]);

  return {
    handleCycleBlockType,
    handleInsertCodeBlock,
    handleInsertImage,
    handleInsertTable,
    handleToggleInlineFormat,
  };
}
