import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isListItemNode, $isListNode, type ListItemNode } from "@lexical/list";
import { mergeRegister } from "@lexical/utils";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_NORMAL,
  INDENT_CONTENT_COMMAND,
  KEY_TAB_COMMAND,
  type LexicalNode,
} from "lexical";

import { $indentChecklistItemPreservingStructure } from "../lib/list-indent";

function $getAncestorListItem(node: LexicalNode): ListItemNode | null {
  let current: LexicalNode | null = node;
  while (current && !$isListItemNode(current)) {
    current = current.getParent();
  }
  return $isListItemNode(current) ? current : null;
}

function $getSelectedListItem(): ListItemNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return null;
  }

  const anchorListItem = $getAncestorListItem(selection.anchor.getNode());
  const focusListItem = $getAncestorListItem(selection.focus.getNode());

  if (!anchorListItem || !focusListItem || !anchorListItem.is(focusListItem)) {
    return null;
  }

  return anchorListItem;
}

export default function ListIndentPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handleChecklistIndent = (): boolean | null => {
      const listItemNode = $getSelectedListItem();
      if (!listItemNode) {
        return null;
      }

      const parentList = listItemNode.getParent();
      if (!$isListNode(parentList) || parentList.getListType() !== "check") {
        return null;
      }

      return $indentChecklistItemPreservingStructure(listItemNode);
    };

    return mergeRegister(
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => {
          if (event.shiftKey) {
            return false;
          }

          const handled = handleChecklistIndent();
          if (handled === null) {
            return false;
          }

          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_NORMAL,
      ),
      editor.registerCommand(
        INDENT_CONTENT_COMMAND,
        () => {
          const handled = handleChecklistIndent();
          if (handled === null) {
            return false;
          }
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [editor]);

  return null;
}
