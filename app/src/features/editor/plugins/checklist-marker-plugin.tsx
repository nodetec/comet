import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isRangeSelection,
  type LexicalNode,
} from "lexical";
import { $isListItemNode, $isListNode, ListItemNode } from "@lexical/list";
import { normalizeChecklistItemMarker } from "../lib/checklist-marker";
import { $isListAnchorNode } from "../nodes/list-anchor-node";

function isChecklistListItem(
  node: LexicalNode | null | undefined,
): node is ListItemNode {
  if (!$isListItemNode(node)) {
    return false;
  }

  const parentList = node.getParent();
  return $isListNode(parentList) && parentList.getListType() === "check";
}

export default function ChecklistMarkerPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const marker = target.closest(".comet-list-anchor");
      if (!(marker instanceof HTMLElement)) {
        return;
      }

      editor.update(() => {
        const node = $getNearestNodeFromDOMNode(marker);
        if (!$isListAnchorNode(node)) {
          return;
        }

        const listItem = node.getParent();
        if (!isChecklistListItem(listItem)) {
          return;
        }

        const selection = $getSelection();
        if ($isRangeSelection(selection) && !selection.isCollapsed()) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        listItem.toggleChecked();
        listItem.selectEnd();
      });
    };

    return mergeRegister(
      editor.registerNodeTransform(ListItemNode, (listItemNode) => {
        normalizeChecklistItemMarker(listItemNode);
      }),
      editor.registerRootListener((root, prevRoot) => {
        prevRoot?.removeEventListener("click", handleClick);
        root?.addEventListener("click", handleClick);
      }),
      () => {
        editor.getRootElement()?.removeEventListener("click", handleClick);
      },
    );
  }, [editor]);

  return null;
}
