import { $findMatchingParent } from "@lexical/utils";
import { $isListItemNode, $isListNode, type ListItemNode } from "@lexical/list";
import {
  $isRangeSelection,
  type BaseSelection,
  type LexicalNode,
} from "lexical";
import { $isListAnchorNode } from "../nodes/list-anchor-node";

function getChecklistItem(node: LexicalNode): ListItemNode | null {
  if ($isListItemNode(node)) {
    const parentList = node.getParent();
    if ($isListNode(parentList) && parentList.getListType() === "check") {
      return node;
    }
  }

  const parent = $findMatchingParent(
    node,
    (candidate): candidate is ListItemNode => {
      if (!$isListItemNode(candidate)) {
        return false;
      }

      const parentList = candidate.getParent();
      return $isListNode(parentList) && parentList.getListType() === "check";
    },
  );

  return $isListItemNode(parent) ? parent : null;
}

export function shouldCopyChecklistSelectionAsPlainText(
  selection: BaseSelection | null,
): boolean {
  if (!$isRangeSelection(selection) || selection.isCollapsed()) {
    return false;
  }

  const nodes = selection.getNodes();
  let sawChecklistContent = false;

  for (const node of nodes) {
    if ($isListAnchorNode(node)) {
      return false;
    }

    if ($isListNode(node) && node.getListType() === "check") {
      sawChecklistContent = true;
      continue;
    }

    const checklistItem = getChecklistItem(node);
    if (checklistItem) {
      sawChecklistContent = true;
      continue;
    }

    return false;
  }

  return sawChecklistContent;
}
