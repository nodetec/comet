import { $isListItemNode, $isListNode, type ListItemNode } from "@lexical/list";
import type { LexicalNode } from "lexical";

import { isEmptyChecklistLeafItem } from "./checklist-marker";

type ChecklistPasteListItem = {
  checked: boolean;
  text: string;
};

function parseChecklistItems(
  markdown: string,
): ChecklistPasteListItem[] | null {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");

  let start = 0;
  while (start < lines.length && lines[start]?.trim() === "") {
    start++;
  }

  let end = lines.length - 1;
  while (end >= start && lines[end]?.trim() === "") {
    end--;
  }

  if (start > end) {
    return null;
  }

  const items: ChecklistPasteListItem[] = [];

  for (let index = start; index <= end; index++) {
    const match = /^\s*[-*+]\s+\[([ xX])\]\s?(.*)$/.exec(lines[index] ?? "");
    if (!match) {
      return null;
    }

    items.push({
      checked: match[1].toLowerCase() === "x",
      text: match[2],
    });
  }

  return items;
}

export function parseSingleChecklistItemContent(
  markdown: string,
): string | null {
  const items = parseChecklistItems(markdown);
  if (items === null || items.length !== 1) {
    return null;
  }

  return items[0]?.text ?? null;
}

export function replaceEmptyChecklistItemWithChecklistNodes(
  targetListItem: ListItemNode,
  nodes: LexicalNode[],
): boolean {
  const parentList = targetListItem.getParent();
  if (
    !$isListNode(parentList) ||
    parentList.getListType() !== "check" ||
    !isEmptyChecklistLeafItem(targetListItem)
  ) {
    return false;
  }

  if (nodes.length === 0 || !nodes.every($isListNode)) {
    return false;
  }

  const replacementLists = nodes.filter(
    (node) => $isListNode(node) && node.getListType() === "check",
  );
  if (replacementLists.length !== nodes.length) {
    return false;
  }

  const replacementItems = replacementLists.flatMap((listNode) =>
    listNode.getChildren().filter($isListItemNode),
  );
  if (replacementItems.length === 0) {
    return false;
  }

  const [firstReplacement, ...otherReplacements] = replacementItems;
  targetListItem.insertBefore(firstReplacement);

  let previousItem = firstReplacement;
  for (const replacementItem of otherReplacements) {
    previousItem.insertAfter(replacementItem);
    previousItem = replacementItem;
  }

  targetListItem.remove();
  previousItem.selectEnd();
  return true;
}
