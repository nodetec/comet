import {
  $createListNode,
  $isListItemNode,
  $isListNode,
  type ListItemNode,
  type ListType,
} from "@lexical/list";
import { $isElementNode, $isTextNode, type LexicalNode } from "lexical";

function isIgnorableListItemContent(node: LexicalNode): boolean {
  if (node.getType() === "list-anchor") {
    return true;
  }

  if ($isTextNode(node)) {
    return node.getTextContent().trim().length === 0;
  }

  return (
    $isElementNode(node) &&
    !$isListNode(node) &&
    node.getChildrenSize() === 0 &&
    node.getTextContent().trim().length === 0
  );
}

function $getNestedListChild(listItemNode: ListItemNode, listType: ListType) {
  for (const child of listItemNode.getChildren()) {
    if ($isListNode(child) && child.getListType() === listType) {
      return child;
    }
  }

  return null;
}

function $hasMeaningfulNonListContent(listItemNode: ListItemNode): boolean {
  for (const child of listItemNode.getChildren()) {
    if ($isListNode(child) || isIgnorableListItemContent(child)) {
      continue;
    }

    return true;
  }

  return false;
}

function $isEmptyListContainerItem(listItemNode: ListItemNode): boolean {
  for (const child of listItemNode.getChildren()) {
    if ($isListNode(child)) {
      if (child.getChildrenSize() > 0) {
        return false;
      }
      continue;
    }

    if (!isIgnorableListItemContent(child)) {
      return false;
    }
  }

  return true;
}

export function $shouldOutdentListItemPreservingOrder(
  listItemNode: ListItemNode,
): boolean {
  const parentList = listItemNode.getParent();
  const grandparentListItem = parentList?.getParent();
  const greatGrandparentList = grandparentListItem?.getParent();

  return (
    $isListNode(parentList) &&
    $isListItemNode(grandparentListItem) &&
    $isListNode(greatGrandparentList) &&
    $hasMeaningfulNonListContent(grandparentListItem)
  );
}

export function $outdentListItemPreservingOrder(
  listItemNode: ListItemNode,
): boolean {
  if (!$shouldOutdentListItemPreservingOrder(listItemNode)) {
    return false;
  }

  const parentList = listItemNode.getParentOrThrow();
  const grandparentListItem = parentList.getParentOrThrow();

  if (!$isListNode(parentList) || !$isListItemNode(grandparentListItem)) {
    return false;
  }

  const nextSiblings = listItemNode.getNextSiblings();
  if (nextSiblings.length > 0) {
    let nestedList = $getNestedListChild(
      listItemNode,
      parentList.getListType(),
    );
    if (!nestedList) {
      nestedList = $createListNode(parentList.getListType());
      listItemNode.append(nestedList);
    }

    for (const sibling of nextSiblings) nestedList.append(sibling);
  }

  grandparentListItem.insertAfter(listItemNode);

  if (parentList.isEmpty()) {
    parentList.remove();
  }

  if ($isEmptyListContainerItem(grandparentListItem)) {
    grandparentListItem.remove();
  }

  return true;
}
