import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent } from "@lexical/utils";
import { $isListItemNode, $isListNode } from "@lexical/list";
import { $getSelection, $isRangeSelection } from "lexical";

const SELECTED_CLASS = "comet-checklist-item--range-selected";

function collectSelectedChecklistItemKeys(): Set<string> {
  const selection = $getSelection();
  const nextKeys = new Set<string>();

  if (!$isRangeSelection(selection) || selection.isCollapsed()) {
    return nextKeys;
  }

  for (const node of selection.getNodes()) {
    const listItem = $isListItemNode(node)
      ? node
      : $findMatchingParent(node, $isListItemNode);

    if (!$isListItemNode(listItem)) {
      continue;
    }

    const parent = listItem.getParent();
    if ($isListNode(parent) && parent.getListType() === "check") {
      nextKeys.add(listItem.getKey());
    }
  }

  return nextKeys;
}

export default function ChecklistSelectionPlugin(): null {
  const [editor] = useLexicalComposerContext();
  const selectedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const syncSelection = () => {
      editor.getEditorState().read(() => {
        const nextKeys = collectSelectedChecklistItemKeys();
        const prevKeys = selectedKeysRef.current;

        for (const key of prevKeys) {
          if (nextKeys.has(key)) {
            continue;
          }

          editor.getElementByKey(key)?.classList.remove(SELECTED_CLASS);
        }

        for (const key of nextKeys) {
          if (prevKeys.has(key)) {
            continue;
          }

          editor.getElementByKey(key)?.classList.add(SELECTED_CLASS);
        }

        selectedKeysRef.current = nextKeys;
      });
    };

    const removeUpdateListener = editor.registerUpdateListener(() => {
      syncSelection();
    });

    const removeRootListener = editor.registerRootListener((_, prevRoot) => {
      if (!prevRoot) {
        return;
      }

      for (const key of selectedKeysRef.current) {
        editor.getElementByKey(key)?.classList.remove(SELECTED_CLASS);
      }

      selectedKeysRef.current = new Set();
    });

    syncSelection();

    return () => {
      removeUpdateListener();
      removeRootListener();

      for (const key of selectedKeysRef.current) {
        editor.getElementByKey(key)?.classList.remove(SELECTED_CLASS);
      }
    };
  }, [editor]);

  return null;
}
