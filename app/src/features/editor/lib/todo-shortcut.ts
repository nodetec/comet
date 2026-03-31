import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  type ListNode,
  ListItemNode,
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

// Empty checklist items need a visible-width placeholder so the caret has
// somewhere to render when the item contains no real text yet.
const LEGACY_CHECKLIST_PLACEHOLDER = "\u200B";
export const CHECKLIST_LEFT_CURSOR_ANCHOR = "\u2062";
export const CHECKLIST_CURSOR_ANCHOR = "\u2060";
export const CHECKLIST_PLACEHOLDER = "\u00A0";
type ChecklistParagraphSelection = "end" | "start" | "none";

export function isChecklistPlaceholderTextContent(text: string): boolean {
  return (
    text === CHECKLIST_PLACEHOLDER || text === LEGACY_CHECKLIST_PLACEHOLDER
  );
}

export function isChecklistLeftCursorAnchorTextContent(text: string): boolean {
  return text === CHECKLIST_LEFT_CURSOR_ANCHOR;
}

export function isChecklistCursorAnchorTextContent(text: string): boolean {
  return (
    text === CHECKLIST_CURSOR_ANCHOR ||
    isChecklistLeftCursorAnchorTextContent(text)
  );
}

export function stripChecklistPlaceholders(text: string): string {
  return text
    .split(CHECKLIST_PLACEHOLDER)
    .join("")
    .split(LEGACY_CHECKLIST_PLACEHOLDER)
    .join("")
    .split(CHECKLIST_LEFT_CURSOR_ANCHOR)
    .join("")
    .split(CHECKLIST_CURSOR_ANCHOR)
    .join("");
}

function getOffsetAfterStrippingChecklistPlaceholders(
  text: string,
  offset: number,
): number {
  const boundedOffset = Math.max(0, Math.min(offset, text.length));
  let removedCount = 0;

  for (let i = 0; i < boundedOffset; i++) {
    if (
      isChecklistPlaceholderTextContent(text[i] ?? "") ||
      isChecklistCursorAnchorTextContent(text[i] ?? "")
    ) {
      removedCount++;
    }
  }

  return boundedOffset - removedCount;
}

export function $isChecklistPlaceholderText(
  node: LexicalNode | null | undefined,
): boolean {
  return (
    $isTextNode(node) &&
    isChecklistPlaceholderTextContent(node.getTextContent())
  );
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

function isMeaningfulChild(child: LexicalNode): boolean {
  if ($isTextNode(child)) {
    return stripChecklistPlaceholders(child.getTextContent()).length > 0;
  }
  if ($isListNode(child)) {
    return child.getChildrenSize() > 0;
  }
  if ($isElementNode(child) && child.getChildrenSize() > 0) {
    return true;
  }
  return child.getTextContent().trim().length > 0;
}

function hasMeaningfulSiblingContent(
  ownerItem: ListItemNode,
  excludeNode: LexicalNode,
): boolean {
  for (const child of ownerItem.getChildren()) {
    if (child.is(excludeNode) || child.getType() === "list-anchor") {
      continue;
    }
    if (isMeaningfulChild(child)) {
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

  for (const child of listItemNode.getChildren()) {
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

export function $convertChecklistItemToParagraph(
  listItemNode: ListItemNode,
  selectionBehavior: ChecklistParagraphSelection = "end",
): ParagraphNode {
  const paragraph = $createParagraphNode();
  const hasVisibleContent = $moveChecklistItemContentToParagraph(
    listItemNode,
    paragraph,
  );
  const parentList = listItemNode.getParent();

  if ($isListNode(parentList) && parentList.getListType() === "check") {
    moveChecklistItemContentToParagraphContext(
      listItemNode,
      parentList,
      paragraph,
    );
  } else {
    listItemNode.replace(paragraph);
  }

  selectConvertedChecklistParagraph(
    paragraph,
    hasVisibleContent,
    selectionBehavior,
  );

  return paragraph;
}

function moveChecklistItemContentToParagraphContext(
  listItemNode: ListItemNode,
  parentList: ListNode,
  paragraph: ParagraphNode,
): void {
  const hasBeforeSiblings = listItemNode.getPreviousSibling() !== null;
  const nextSiblings = listItemNode.getNextSiblings().filter($isListItemNode);

  if (hasBeforeSiblings) {
    insertParagraphAfterChecklistList(parentList, paragraph);
  } else {
    insertParagraphBeforeChecklistList(parentList, paragraph);
  }

  const insertAfterNode = moveNestedChecklistChildrenAfterParagraph(
    listItemNode,
    paragraph,
  );

  if (hasBeforeSiblings) {
    moveTrailingChecklistSiblingsToNewList(
      parentList,
      insertAfterNode,
      nextSiblings,
    );
  }

  listItemNode.remove();

  if (!hasBeforeSiblings) {
    mergePromotedChecklistWithRemainingSiblings(parentList, insertAfterNode);
  }

  if (parentList.isEmpty()) {
    parentList.remove();
  }
}

function insertParagraphAfterChecklistList(
  parentList: ListNode,
  paragraph: ParagraphNode,
): void {
  parentList.insertAfter(paragraph);
}

function insertParagraphBeforeChecklistList(
  parentList: ListNode,
  paragraph: ParagraphNode,
): void {
  parentList.insertBefore(paragraph);
}

function moveNestedChecklistChildrenAfterParagraph(
  listItemNode: ListItemNode,
  paragraph: ParagraphNode,
): LexicalNode {
  let insertAfterNode: LexicalNode = paragraph;

  for (const child of listItemNode.getChildren()) {
    if (!$isListNode(child)) {
      continue;
    }

    insertAfterNode.insertAfter(child);
    insertAfterNode = child;
  }

  return insertAfterNode;
}

function moveTrailingChecklistSiblingsToNewList(
  parentList: ListNode,
  insertAfterNode: LexicalNode,
  nextSiblings: ListItemNode[],
): void {
  if (nextSiblings.length === 0) {
    return;
  }

  const trailingList = $createListNode(parentList.getListType());
  insertAfterNode.insertAfter(trailingList);
  trailingList.append(...nextSiblings);
}

function mergePromotedChecklistWithRemainingSiblings(
  parentList: ListNode,
  insertAfterNode: LexicalNode,
): void {
  if (
    !$isListNode(insertAfterNode) ||
    insertAfterNode.getListType() !== parentList.getListType() ||
    parentList.getChildrenSize() === 0
  ) {
    return;
  }

  insertAfterNode.append(...parentList.getChildren());
}

function selectConvertedChecklistParagraph(
  paragraph: ParagraphNode,
  hasVisibleContent: boolean,
  selectionBehavior: ChecklistParagraphSelection,
): void {
  if (selectionBehavior === "start") {
    paragraph.selectStart();
    return;
  }

  if (selectionBehavior === "end") {
    if (hasVisibleContent) {
      paragraph.selectEnd();
    } else {
      paragraph.selectStart();
    }
  }
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
  $convertChecklistItemToParagraph(listItemNode);
  return true;
}

function $moveChildrenToListItem(
  paragraphNode: ParagraphNode,
  nestedItem: ListItemNode,
): boolean {
  let hasVisibleContent = false;

  for (const child of paragraphNode.getChildren()) {
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

  return hasVisibleContent;
}

function $insertNestedItemIntoChecklist(
  paragraphNode: ParagraphNode,
  nestedItem: ListItemNode,
): void {
  const previousChecklist = [...paragraphNode.getPreviousSiblings()]
    // eslint-disable-next-line unicorn/no-array-reverse -- app tsconfig targets ES2020, so toReversed() is unavailable here
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
  const hasVisibleContent = $moveChildrenToListItem(paragraphNode, nestedItem);

  if (!hasVisibleContent) {
    const placeholder = $createTextNode(CHECKLIST_PLACEHOLDER);
    nestedItem.append(placeholder);
    placeholder.select(0, 1);
  }

  $insertNestedItemIntoChecklist(paragraphNode, nestedItem);

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
    textContent.length > 0
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
    ![
      CHECKLIST_PLACEHOLDER,
      LEGACY_CHECKLIST_PLACEHOLDER,
      CHECKLIST_LEFT_CURSOR_ANCHOR,
      CHECKLIST_CURSOR_ANCHOR,
    ].some((specialText) => text.includes(specialText)) ||
    isChecklistPlaceholderTextContent(text) ||
    isChecklistCursorAnchorTextContent(text) ||
    !isChecklistTextNode(textNode)
  ) {
    return false;
  }

  const selection = $getSelection();
  const shouldRestoreSelection =
    $isRangeSelection(selection) &&
    selection.anchor.type === "text" &&
    selection.focus.type === "text" &&
    selection.anchor.key === textNode.getKey() &&
    selection.focus.key === textNode.getKey();
  const nextAnchorOffset = shouldRestoreSelection
    ? getOffsetAfterStrippingChecklistPlaceholders(
        text,
        selection.anchor.offset,
      )
    : 0;
  const nextFocusOffset = shouldRestoreSelection
    ? getOffsetAfterStrippingChecklistPlaceholders(text, selection.focus.offset)
    : 0;

  textNode.setTextContent(normalizedText);

  if (shouldRestoreSelection) {
    const size = textNode.getTextContentSize();
    selection.setTextNodeRange(
      textNode,
      Math.min(nextAnchorOffset, size),
      textNode,
      Math.min(nextFocusOffset, size),
    );
  }

  return true;
}
