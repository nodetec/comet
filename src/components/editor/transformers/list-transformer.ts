import {
  CHECK_LIST as BUILTIN_CHECK_LIST,
  ORDERED_LIST as BUILTIN_ORDERED_LIST,
  UNORDERED_LIST as BUILTIN_UNORDERED_LIST,
  type ElementTransformer,
} from "@lexical/markdown";
import {
  $isListItemNode,
  $isListNode,
  type ListItemNode,
  type ListNode,
} from "@lexical/list";
import type { ElementNode, LexicalNode } from "lexical";

function exportListNode(
  listNode: ListNode,
  exportChildren: (node: ElementNode) => string,
  depth = 0,
): string {
  const output: string[] = [];
  let ordinal = 0;

  for (const child of listNode.getChildren()) {
    if (!$isListItemNode(child)) {
      continue;
    }

    const nestedOnlyChild =
      child.getChildrenSize() === 1 ? child.getFirstChild() : null;
    if (nestedOnlyChild && $isListNode(nestedOnlyChild)) {
      output.push(exportListNode(nestedOnlyChild, exportChildren, depth + 1));
      continue;
    }

    const indent = " ".repeat(depth * 2);
    output.push(indent + listItemPrefix(listNode, child, ordinal) + exportChildren(child));
    ordinal++;
  }

  return output.join("\n");
}

function listItemPrefix(
  listNode: ListNode,
  listItemNode: ListItemNode,
  ordinal: number,
): string {
  const listType = listNode.getListType();

  if (listType === "number") {
    return `${listNode.getStart() + ordinal}. `;
  }

  if (listType === "check") {
    return `- [${listItemNode.getChecked() ? "x" : " "}] `;
  }

  return "- ";
}

function exportList(
  node: LexicalNode,
  exportChildren: (node: ElementNode) => string,
): string | null {
  if (!$isListNode(node)) {
    return null;
  }

  return exportListNode(node, exportChildren, 0);
}

export const UNORDERED_LIST: ElementTransformer = {
  ...BUILTIN_UNORDERED_LIST,
  export: exportList,
};

export const CHECK_LIST: ElementTransformer = {
  ...BUILTIN_CHECK_LIST,
  export: exportList,
};

export const ORDERED_LIST: ElementTransformer = {
  ...BUILTIN_ORDERED_LIST,
  export: exportList,
};
