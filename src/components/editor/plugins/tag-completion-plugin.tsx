import { useCallback, useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useBasicTypeaheadTriggerMatch } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  IS_CODE,
} from "lexical";
import { $isCodeNode } from "@lexical/code";
import { Menu } from "@tauri-apps/api/menu";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";

export default function TagCompletionPlugin() {
  const [editor] = useLexicalComposerContext();
  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch("#", {
    minLength: 1,
  });
  const menuOpenRef = useRef(false);
  const dismissedMatchRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTagMenu = useCallback(
    async (
      matchingString: string,
      replaceableString: string,
      leadOffset: number,
      anchorKey: string,
    ) => {
      if (menuOpenRef.current) return;

      const tags = await invoke<string[]>("search_tags", {
        query: matchingString,
      });
      if (tags.length === 0) return;

      // Verify the match is still current
      const stillValid = editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed())
          return false;
        const node = selection.anchor.getNode();
        if (!$isTextNode(node) || node.getKey() !== anchorKey) return false;
        const text = node.getTextContent().slice(0, selection.anchor.offset);
        const currentMatch = checkForTriggerMatch(text, editor);
        return currentMatch?.matchingString === matchingString;
      });
      if (!stillValid) return;

      // Get cursor position for menu placement
      const domSelection = window.getSelection();
      if (!domSelection || domSelection.rangeCount === 0) return;
      const range = domSelection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      let selectedTag: string | null = null;

      const menu = await Menu.new({
        items: tags.map((tag) => ({
          id: `tag-${tag}`,
          text: `#${tag}`,
          action: () => {
            selectedTag = tag;
          },
        })),
      });

      menuOpenRef.current = true;
      try {
        await menu.popup(new LogicalPosition(rect.x, rect.bottom));
      } finally {
        await menu.close();
        menuOpenRef.current = false;
      }

      if (selectedTag) {
        editor.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          const node = selection.anchor.getNode();
          if (!$isTextNode(node)) return;
          node.spliceText(
            leadOffset,
            replaceableString.length,
            `#${selectedTag}`,
          );
          // Move cursor to end of inserted tag
          node.select(
            leadOffset + selectedTag!.length + 1,
            leadOffset + selectedTag!.length + 1,
          );
        });
      } else {
        // Menu dismissed without selection
        dismissedMatchRef.current = matchingString;
      }
    },
    [editor, checkForTriggerMatch],
  );

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      if (menuOpenRef.current) return;

      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;

        const anchor = selection.anchor;
        const anchorNode = anchor.getNode();
        if (!$isTextNode(anchorNode)) return;

        // Skip code contexts
        const parent = anchorNode.getParent();
        if (parent && $isCodeNode(parent)) return;
        if ((anchorNode.getFormat() & IS_CODE) !== 0) return;

        const textUpToCursor = anchorNode
          .getTextContent()
          .slice(0, anchor.offset);
        const match = checkForTriggerMatch(textUpToCursor, editor);

        if (!match) {
          dismissedMatchRef.current = null;
          return;
        }

        // Suppress re-trigger after dismiss
        if (dismissedMatchRef.current === match.matchingString) return;

        // Debounce the tag search
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
          void showTagMenu(
            match.matchingString,
            match.replaceableString,
            match.leadOffset,
            anchorNode.getKey(),
          );
        }, 150);
      });
    });
  }, [editor, checkForTriggerMatch, showTagMenu]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  return null;
}
