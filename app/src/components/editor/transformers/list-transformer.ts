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
import {
  $isParagraphNode,
  $isTextNode,
  type ElementNode,
  type LexicalNode,
} from "lexical";
import { $isListAnchorNode } from "../nodes/list-anchor-node";
import { CHECKLIST_PLACEHOLDER } from "../lib/todo-shortcut";

type BulletMarker = "-" | "*";

function isEmptyParagraphNode(node: LexicalNode): boolean {
  if (!$isParagraphNode(node)) {
    return false;
  }

  const children = node.getChildren();
  if (children.length === 0) {
    return true;
  }

  return (
    children.length === 1 &&
    $isTextNode(children[0]) &&
    /^\s*$/.test(children[0].getTextContent())
  );
}

function isBulletLikeList(
  node: LexicalNode | null | undefined,
): node is ListNode {
  return (
    $isListNode(node) &&
    (node.getListType() === "bullet" || node.getListType() === "check")
  );
}

function getListBulletMarker(listNode: ListNode): BulletMarker {
  const listType = listNode.getListType();
  if (listType !== "bullet" && listType !== "check") {
    return "-";
  }

  let previous: LexicalNode | null = listNode.getPreviousSibling();
  while (previous && isEmptyParagraphNode(previous)) {
    previous = previous.getPreviousSibling();
  }

  if (!isBulletLikeList(previous)) {
    return "-";
  }

  return getListBulletMarker(previous) === "-" ? "*" : "-";
}

function exportListItemContent(
  listItemNode: ListItemNode,
  exportChildren: (node: ElementNode) => string,
): string {
  const contentNode = {
    getChildren: () =>
      listItemNode
        .getChildren()
        .filter(
          (child) =>
            !$isListNode(child) &&
            !$isListAnchorNode(child) &&
            !(
              $isTextNode(child) &&
              child.getTextContent() === CHECKLIST_PLACEHOLDER
            ),
        ),
  } as unknown as ElementNode;

  return exportChildren(contentNode);
}

function exportListNode(
  listNode: ListNode,
  exportChildren: (node: ElementNode) => string,
  depth = 0,
): string {
  const output: string[] = [];
  let ordinal = 0;
  const bulletMarker = getListBulletMarker(listNode);

  for (const child of listNode.getChildren()) {
    if (!$isListItemNode(child)) {
      continue;
    }

    const nestedLists = child
      .getChildren()
      .filter((grandchild): grandchild is ListNode => $isListNode(grandchild));
    const content = exportListItemContent(child, exportChildren);
    const hasOnlyNestedLists =
      nestedLists.length > 0 &&
      child.getChildren().every((grandchild) => $isListNode(grandchild));

    const indent = " ".repeat(depth * 2);
    if (!hasOnlyNestedLists || nestedLists.length === 0) {
      output.push(
        indent +
          listItemPrefix(listNode, child, ordinal, bulletMarker) +
          content,
      );
      ordinal++;
    }

    for (const nestedList of nestedLists) {
      output.push(exportListNode(nestedList, exportChildren, depth + 1));
    }
  }

  return output.join("\n");
}

function listItemPrefix(
  listNode: ListNode,
  listItemNode: ListItemNode,
  ordinal: number,
  bulletMarker: BulletMarker,
): string {
  const listType = listNode.getListType();

  if (listType === "number") {
    return `${listNode.getStart() + ordinal}. `;
  }

  if (listType === "check") {
    return `${bulletMarker} [${listItemNode.getChecked() ? "x" : " "}] `;
  }

  return `${bulletMarker} `;
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
