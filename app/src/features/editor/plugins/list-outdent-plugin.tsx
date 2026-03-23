import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isListItemNode, type ListItemNode } from "@lexical/list";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  OUTDENT_CONTENT_COMMAND,
  type LexicalNode,
} from "lexical";

import { $outdentListItemPreservingOrder } from "../lib/list-outdent";

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

export default function ListOutdentPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      OUTDENT_CONTENT_COMMAND,
      () => {
        const listItemNode = $getSelectedListItem();
        if (!listItemNode) {
          return false;
        }

        return $outdentListItemPreservingOrder(listItemNode);
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor]);

  return null;
}
