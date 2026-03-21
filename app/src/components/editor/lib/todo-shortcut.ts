import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  type ListNode,
} from "@lexical/list";
import {
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  TextNode,
  type LexicalNode,
  type ParagraphNode,
} from "lexical";
import type { ListItemNode } from "@lexical/list";

export const CHECKLIST_PLACEHOLDER = "\u200B";

export function stripChecklistPlaceholders(text: string): string {
  return text.split(CHECKLIST_PLACEHOLDER).join("");
}

export function $isChecklistPlaceholderText(
  node: LexicalNode | null | undefined,
): boolean {
  return $isTextNode(node) && node.getTextContent() === CHECKLIST_PLACEHOLDER;
}

function isChecklist(node: LexicalNode | null | undefined): node is ListNode {
  return $isListNode(node) && node.getListType() === "check";
}

function isChecklistTextNode(node: LexicalNode | null | undefined): boolean {
  if (!$isTextNode(node)) {
    return false;
  }

  const listItem = node.getParent();
  const parentList = listItem?.getParent();
  return isChecklist(parentList);
}

function hasMeaningfulSiblingContent(
  ownerItem: ListItemNode,
  excludeNode: LexicalNode,
): boolean {
  for (const child of ownerItem.getChildren()) {
    if (child.is(excludeNode) || child.getType() === "list-anchor") {
      continue;
    }

    if ($isTextNode(child)) {
      if (stripChecklistPlaceholders(child.getTextContent()).length > 0) {
        return true;
      }
      continue;
    }

    if ($isListNode(child)) {
      if (child.getChildrenSize() > 0) {
        return true;
      }
      continue;
    }

    if (
      ($isElementNode(child) && child.getChildrenSize() > 0) ||
      child.getTextContent().trim().length > 0
    ) {
      return true;
    }
  }

  return false;
}

function $moveChecklistItemContentToParagraph(
  listItemNode: ListItemNode,
  paragraphNode: ParagraphNode,
): boolean {
  let hasVisibleContent = false;

  for (const child of [...listItemNode.getChildren()]) {
    if ($isListNode(child) || child.getType() === "list-anchor") {
      continue;
    }

    if ($isTextNode(child)) {
      const text = stripChecklistPlaceholders(child.getTextContent());
      if (text.length === 0) {
        continue;
      }

      if (text !== child.getTextContent()) {
        child.setTextContent(text);
      }
    }

    paragraphNode.append(child);
    hasVisibleContent = true;
  }

  return hasVisibleContent;
}

export function $convertNestedChecklistItemToParagraph(
  listItemNode: ListItemNode,
): boolean {
  const parentList = listItemNode.getParent();
  const ownerItem = parentList?.getParent();

  if (
    !$isListNode(parentList) ||
    parentList.getListType() !== "check" ||
    !$isListItemNode(ownerItem)
  ) {
    return false;
  }

  const paragraph = $createParagraphNode();
  const hasVisibleContent = $moveChecklistItemContentToParagraph(
    listItemNode,
    paragraph,
  );
  const hasBeforeSiblings = listItemNode.getPreviousSibling() !== null;
  const nextSiblings = listItemNode.getNextSiblings().filter($isListItemNode);

  if (hasBeforeSiblings) {
    parentList.insertAfter(paragraph);
  } else {
    parentList.insertBefore(paragraph);
  }

  let insertAfterNode: LexicalNode = paragraph;

  for (const child of [...listItemNode.getChildren()]) {
    if (!$isListNode(child)) {
      continue;
    }

    insertAfterNode.insertAfter(child);
    insertAfterNode = child;
  }

  if (hasBeforeSiblings && nextSiblings.length > 0) {
    const trailingList = $createListNode(parentList.getListType());
    insertAfterNode.insertAfter(trailingList);
    trailingList.append(...nextSiblings);
  }

  listItemNode.remove();

  if (parentList.isEmpty()) {
    parentList.remove();
  }

  if (hasVisibleContent) {
    paragraph.selectEnd();
  } else {
    paragraph.selectStart();
  }

  return true;
}

export function $convertChecklistParagraphToNestedItem(
  paragraphNode: ParagraphNode,
): boolean {
  const ownerItem = paragraphNode.getParent();
  const ownerList = ownerItem?.getParent();

  if (
    !$isParagraphNode(paragraphNode) ||
    !$isListItemNode(ownerItem) ||
    !$isListNode(ownerList) ||
    ownerList.getListType() !== "check" ||
    !hasMeaningfulSiblingContent(ownerItem, paragraphNode)
  ) {
    return false;
  }

  const nestedItem = $createListItemNode(false);
  let hasVisibleContent = false;

  for (const child of [...paragraphNode.getChildren()]) {
    if ($isTextNode(child)) {
      const text = stripChecklistPlaceholders(child.getTextContent());
      if (text.length === 0) {
        continue;
      }

      if (text !== child.getTextContent()) {
        child.setTextContent(text);
      }
    }

    nestedItem.append(child);
    hasVisibleContent = true;
  }

  if (!hasVisibleContent) {
    const placeholder = $createTextNode(CHECKLIST_PLACEHOLDER);
    nestedItem.append(placeholder);
    placeholder.select(0, 1);
  }

  const previousChecklist = [...paragraphNode.getPreviousSiblings()]
    .reverse()
    .find(
      (sibling): sibling is ListNode =>
        $isListNode(sibling) && sibling.getListType() === "check",
    );
  const nextChecklist = paragraphNode
    .getNextSiblings()
    .find(
      (sibling): sibling is ListNode =>
        $isListNode(sibling) && sibling.getListType() === "check",
    );

  if (previousChecklist) {
    previousChecklist.append(nestedItem);
    if (nextChecklist) {
      previousChecklist.append(...nextChecklist.getChildren());
      nextChecklist.remove();
    }
    paragraphNode.remove();
  } else if (nextChecklist) {
    const firstChild = nextChecklist.getFirstChild();
    if (firstChild) {
      firstChild.insertBefore(nestedItem);
    } else {
      nextChecklist.append(nestedItem);
    }
    paragraphNode.remove();
  } else {
    const nestedChecklist = $createListNode("check");
    nestedChecklist.append(nestedItem);
    paragraphNode.replace(nestedChecklist);
  }

  if (hasVisibleContent) {
    nestedItem.selectEnd();
  }

  return true;
}

export function $replaceEmptyParagraphWithChecklist(
  paragraphNode: ParagraphNode,
): boolean {
  const textContent = stripChecklistPlaceholders(
    paragraphNode.getTextContent(),
  );

  if (
    !$isParagraphNode(paragraphNode) ||
    paragraphNode
      .getChildren()
      .some((child) => child.getType() === "linebreak") ||
    textContent.length !== 0
  ) {
    return false;
  }

  const previousSibling = paragraphNode.getPreviousSibling();
  const nextSibling = paragraphNode.getNextSibling();

  const checklist = $createListNode("check");
  const listItem = $createListItemNode(false);
  const placeholder = $createTextNode(CHECKLIST_PLACEHOLDER);
  listItem.append(placeholder);
  checklist.append(listItem);

  paragraphNode.replace(checklist);

  if (isChecklist(previousSibling)) {
    previousSibling.append(listItem);
    checklist.remove();

    if (isChecklist(nextSibling)) {
      previousSibling.append(...nextSibling.getChildren());
      nextSibling.remove();
    }
  } else if (isChecklist(nextSibling)) {
    const firstChild = nextSibling.getFirstChild();
    if (firstChild) {
      firstChild.insertBefore(listItem);
    } else {
      nextSibling.append(listItem);
    }
    checklist.remove();
  }

  placeholder.select(0, 1);
  return true;
}

export function $collapseChecklistPlaceholderSelection(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) {
    return false;
  }

  if (
    selection.anchor.type !== "text" ||
    selection.focus.type !== "text" ||
    selection.anchor.key !== selection.focus.key
  ) {
    return false;
  }

  const textNode = selection.anchor.getNode();
  if (!$isChecklistPlaceholderText(textNode)) {
    return false;
  }

  const start = Math.min(selection.anchor.offset, selection.focus.offset);
  const end = Math.max(selection.anchor.offset, selection.focus.offset);
  if (start !== 0 || end !== 1) {
    return false;
  }

  textNode.select(1, 1);
  return true;
}

export function $normalizeChecklistPlaceholderTextNode(
  textNode: TextNode,
): boolean {
  const text = textNode.getTextContent();
  const normalizedText = stripChecklistPlaceholders(text);
  if (
    !text.includes(CHECKLIST_PLACEHOLDER) ||
    text === CHECKLIST_PLACEHOLDER ||
    !isChecklistTextNode(textNode)
  ) {
    return false;
  }

  textNode.setTextContent(normalizedText);
  return true;
}
