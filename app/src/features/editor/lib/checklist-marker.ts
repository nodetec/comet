import {
  $isListItemNode,
  $isListNode,
  type ListItemNode,
  type ListNode,
} from "@lexical/list";
import {
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  $createTextNode,
  type RangeSelection,
  type TextNode,
  type LexicalNode,
} from "lexical";
import {
  $createListAnchorNode,
  getChecklistMarkerText,
  $isListAnchorNode,
  type ListAnchorNode,
} from "../nodes/list-anchor-node";
import {
  CHECKLIST_LEFT_CURSOR_ANCHOR,
  CHECKLIST_CURSOR_ANCHOR,
  CHECKLIST_PLACEHOLDER,
  $convertChecklistItemToParagraph,
  $outdentNestedChecklistItemToParagraph,
  isChecklistLeftCursorAnchorTextContent,
  isChecklistCursorAnchorTextContent,
  isChecklistPlaceholderTextContent,
  stripChecklistPlaceholders,
} from "./todo-shortcut";

function isChecklistList(
  node: LexicalNode | null | undefined,
): node is ListNode {
  return $isListNode(node) && node.getListType() === "check";
}

function isIgnorableWrapperChild(node: LexicalNode): boolean {
  if ($isListAnchorNode(node)) {
    return true;
  }

  if ($isParagraphNode(node)) {
    return (
      stripChecklistPlaceholders(node.getTextContent()).trim().length === 0
    );
  }

  if ($isTextNode(node)) {
    return (
      stripChecklistPlaceholders(node.getTextContent()).trim().length === 0
    );
  }

  return false;
}

function shouldChecklistItemHaveMarker(listItemNode: ListItemNode): boolean {
  const parentList = listItemNode.getParent();
  if (!isChecklistList(parentList)) {
    return false;
  }

  const children = listItemNode.getChildren();
  const hasNestedList = children.some($isListNode);
  if (!hasNestedList) {
    return true;
  }

  return !children.every(
    (child) => $isListNode(child) || isIgnorableWrapperChild(child),
  );
}

function listAnchorChildren(listItemNode: ListItemNode): ListAnchorNode[] {
  return listItemNode.getChildren().filter($isListAnchorNode);
}

function isChecklistMarkerSpacingTextNode(node: LexicalNode): node is TextNode {
  return (
    $isTextNode(node) &&
    (isChecklistPlaceholderTextContent(node.getTextContent()) ||
      isChecklistCursorAnchorTextContent(node.getTextContent()))
  );
}

function isChecklistLeadingCursorAnchorTextNode(
  node: LexicalNode | null | undefined,
): node is TextNode {
  return (
    $isTextNode(node) &&
    isChecklistLeftCursorAnchorTextContent(node.getTextContent())
  );
}

function removeNodes(nodes: LexicalNode[]): boolean {
  let changed = false;
  for (const node of nodes) {
    node.remove();
    changed = true;
  }
  return changed;
}

function hasMeaningfulChecklistContent(listItemNode: ListItemNode): boolean {
  return listItemNode.getChildren().some((child) => {
    if ($isListAnchorNode(child) || $isListNode(child)) {
      return false;
    }

    if ($isTextNode(child)) {
      return (
        stripChecklistPlaceholders(child.getTextContent()).trim().length > 0
      );
    }

    return child.getTextContent().trim().length > 0;
  });
}

export function hasSelectedChecklistMarker(
  listItemNode: ListItemNode,
): boolean {
  return listAnchorChildren(listItemNode).length > 0;
}

export function getChecklistItemsWithSelectedMarkers(
  selection: RangeSelection,
): ListItemNode[] {
  if (!$isRangeSelection(selection) || selection.isCollapsed()) {
    return [];
  }

  const selectedItems: ListItemNode[] = [];
  const seenKeys = new Set<string>();

  for (const node of selection.getNodes()) {
    if (!$isListAnchorNode(node)) {
      continue;
    }

    const listItem = node.getParent();
    if (
      !$isListItemNode(listItem) ||
      !shouldChecklistItemHaveMarker(listItem) ||
      seenKeys.has(listItem.getKey())
    ) {
      continue;
    }

    seenKeys.add(listItem.getKey());
    selectedItems.push(listItem);
  }

  return selectedItems;
}

export function removeExpandedChecklistSelection(
  selection: RangeSelection,
): boolean {
  const selectedChecklistItems =
    getChecklistItemsWithSelectedMarkers(selection);
  if (selectedChecklistItems.length === 0) {
    return false;
  }

  selection.removeText();

  for (const listItem of selectedChecklistItems) {
    if (!listItem.isAttached() || !shouldChecklistItemHaveMarker(listItem)) {
      continue;
    }

    if (isEmptyChecklistLeafItem(listItem)) {
      if (!$outdentNestedChecklistItemToParagraph(listItem, "start")) {
        $convertChecklistItemToParagraph(listItem, "start");
      }
    } else {
      normalizeChecklistItemMarker(listItem);
    }
  }

  return true;
}

export function isEmptyChecklistLeafItem(listItemNode: ListItemNode): boolean {
  return (
    !listItemNode.getChildren().some($isListNode) &&
    !hasMeaningfulChecklistContent(listItemNode)
  );
}

export function findSingleCharacterChecklistTextNode(
  listItemNode: ListItemNode,
): TextNode | null {
  if (listItemNode.getChildren().some($isListNode)) {
    return null;
  }

  let candidate: TextNode | null = null;

  for (const child of listItemNode.getChildren()) {
    if ($isListAnchorNode(child) || isChecklistMarkerSpacingTextNode(child)) {
      continue;
    }

    if (!$isTextNode(child)) {
      return null;
    }

    const visibleText = stripChecklistPlaceholders(child.getTextContent());
    if (visibleText.length !== 1) {
      return null;
    }

    if (candidate !== null) {
      return null;
    }

    candidate = child;
  }

  return candidate;
}

function clearChecklistMarkerArtifacts(
  anchors: ListAnchorNode[],
  placeholderNodes: TextNode[],
): boolean {
  const removedAnchors = removeNodes(anchors);
  const removedPlaceholders = removeNodes(placeholderNodes);
  return removedAnchors || removedPlaceholders;
}

function ensurePrimaryAnchor(
  listItemNode: ListItemNode,
  anchors: ListAnchorNode[],
) {
  let changed = false;
  let primaryAnchor = anchors[0] ?? null;

  if (primaryAnchor == null) {
    primaryAnchor = $createListAnchorNode();
    const firstChild = listItemNode.getFirstChild();
    if (firstChild) {
      firstChild.insertBefore(primaryAnchor);
    } else {
      listItemNode.append(primaryAnchor);
    }
    changed = true;
  }

  changed = removeNodes(anchors.slice(1)) || changed;

  const previousSibling = primaryAnchor.getPreviousSibling();
  if (
    previousSibling != null &&
    !isChecklistLeadingCursorAnchorTextNode(previousSibling)
  ) {
    listItemNode.getFirstChild()?.insertBefore(primaryAnchor);
    changed = true;
  }

  const expectedAnchorText = getChecklistMarkerText();
  if (primaryAnchor.getAnchorText() !== expectedAnchorText) {
    primaryAnchor.setAnchorText(expectedAnchorText);
    changed = true;
  }

  return { changed, primaryAnchor };
}

function syncLeadingCursorAnchorNodes(
  primaryAnchor: ListAnchorNode,
  leadingCursorNodes: TextNode[],
  desiredText: string | null,
): boolean {
  if (desiredText == null) {
    return removeNodes(leadingCursorNodes);
  }

  let changed = false;
  const primaryLeadingCursor = leadingCursorNodes[0] ?? null;
  if (primaryLeadingCursor == null) {
    const previousNode = $createTextNode(desiredText);
    previousNode.toggleUnmergeable();
    primaryAnchor.insertBefore(previousNode);
    changed = true;
  } else {
    if (primaryLeadingCursor.getTextContent() !== desiredText) {
      primaryLeadingCursor.setTextContent(desiredText);
      changed = true;
    }

    if (!primaryLeadingCursor.isUnmergeable()) {
      primaryLeadingCursor.toggleUnmergeable();
      changed = true;
    }

    if (!primaryAnchor.getPreviousSibling()?.is(primaryLeadingCursor)) {
      primaryAnchor.insertBefore(primaryLeadingCursor);
      changed = true;
    }
  }

  return removeNodes(leadingCursorNodes.slice(1)) || changed;
}

function syncPlaceholderNodes(
  primaryAnchor: ListAnchorNode,
  placeholderNodes: TextNode[],
  desiredText: string | null,
): boolean {
  if (desiredText == null) {
    return removeNodes(placeholderNodes);
  }

  let changed = false;
  const primaryPlaceholder = placeholderNodes[0] ?? null;
  const shouldBeUnmergeable = desiredText === CHECKLIST_CURSOR_ANCHOR;
  if (primaryPlaceholder == null) {
    const nextNode = $createTextNode(desiredText);
    if (shouldBeUnmergeable) {
      nextNode.toggleUnmergeable();
    }
    primaryAnchor.insertAfter(nextNode);
    changed = true;
  } else {
    if (primaryPlaceholder.getTextContent() !== desiredText) {
      primaryPlaceholder.setTextContent(desiredText);
      changed = true;
    }

    if (primaryPlaceholder.isUnmergeable() !== shouldBeUnmergeable) {
      primaryPlaceholder.toggleUnmergeable();
      changed = true;
    }

    if (!primaryAnchor.getNextSibling()?.is(primaryPlaceholder)) {
      primaryAnchor.insertAfter(primaryPlaceholder);
      changed = true;
    }
  }

  return removeNodes(placeholderNodes.slice(1)) || changed;
}

export function normalizeChecklistItemMarker(
  listItemNode: ListItemNode,
): boolean {
  const anchors = listAnchorChildren(listItemNode);
  const leadingCursorNodes = listItemNode
    .getChildren()
    .filter(isChecklistLeadingCursorAnchorTextNode);
  const placeholderNodes = listItemNode
    .getChildren()
    .filter(
      (child): child is TextNode =>
        isChecklistMarkerSpacingTextNode(child) &&
        !isChecklistLeadingCursorAnchorTextNode(child),
    );

  if (!shouldChecklistItemHaveMarker(listItemNode)) {
    return (
      clearChecklistMarkerArtifacts(anchors, placeholderNodes) ||
      removeNodes(leadingCursorNodes)
    );
  }

  const { changed: anchorChanged, primaryAnchor } = ensurePrimaryAnchor(
    listItemNode,
    anchors,
  );
  const hasMeaningfulContent = hasMeaningfulChecklistContent(listItemNode);
  const hasNestedLists = listItemNode.getChildren().some($isListNode);
  let desiredLeadingText: string | null = null;
  let desiredText: string | null = null;

  if (hasMeaningfulContent) {
    desiredLeadingText = CHECKLIST_LEFT_CURSOR_ANCHOR;
    desiredText = CHECKLIST_CURSOR_ANCHOR;
  } else if (!hasNestedLists) {
    desiredText = CHECKLIST_PLACEHOLDER;
  }

  const leadingChanged = syncLeadingCursorAnchorNodes(
    primaryAnchor,
    leadingCursorNodes,
    desiredLeadingText,
  );
  const placeholderChanged = syncPlaceholderNodes(
    primaryAnchor,
    placeholderNodes,
    desiredText,
  );

  return anchorChanged || leadingChanged || placeholderChanged;
}

export function $isChecklistListItem(
  node: LexicalNode | null | undefined,
): node is ListItemNode {
  if (!$isListItemNode(node)) {
    return false;
  }

  return isChecklistList(node.getParent());
}
