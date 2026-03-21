import {
  $createListNode,
  $isListItemNode,
  $isListNode,
  type ListItemNode,
  type ListNode,
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

function $getNestedListChild(
  listItemNode: ListItemNode,
  listType: ListType,
): ListNode | null {
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

function $getPreviousMeaningfulSibling(
  listItemNode: ListItemNode,
): ListItemNode | null {
  let sibling = listItemNode.getPreviousSibling();

  while (sibling) {
    if ($isListItemNode(sibling) && $hasMeaningfulNonListContent(sibling)) {
      return sibling;
    }
    sibling = sibling.getPreviousSibling();
  }

  return null;
}

function $mergeWrapperSiblingsIntoOwner(
  ownerItem: ListItemNode,
  stopBefore: ListItemNode,
  listType: ListType,
): void {
  let sibling = ownerItem.getNextSibling();

  while (sibling && !sibling.is(stopBefore)) {
    const nextSibling = sibling.getNextSibling();

    if ($isListItemNode(sibling) && !$hasMeaningfulNonListContent(sibling)) {
      const nestedLists = sibling
        .getChildren()
        .filter(
          (child): child is ListNode =>
            $isListNode(child) && child.getListType() === listType,
        );

      if (nestedLists.length > 0) {
        let targetNestedList = $getNestedListChild(ownerItem, listType);
        if (!targetNestedList) {
          targetNestedList = $createListNode(listType);
          ownerItem.append(targetNestedList);
        }

        for (const nestedList of nestedLists) {
          targetNestedList.append(...nestedList.getChildren());
          nestedList.remove();
        }
      }

      sibling.remove();
    }

    sibling = nextSibling;
  }
}

export function $indentChecklistItemPreservingStructure(
  listItemNode: ListItemNode,
): boolean {
  const parentList = listItemNode.getParent();
  if (!$isListNode(parentList) || parentList.getListType() !== "check") {
    return false;
  }

  const ownerItem = $getPreviousMeaningfulSibling(listItemNode);
  if (!ownerItem) {
    return false;
  }

  $mergeWrapperSiblingsIntoOwner(
    ownerItem,
    listItemNode,
    parentList.getListType(),
  );

  let nestedList = $getNestedListChild(ownerItem, parentList.getListType());
  if (!nestedList) {
    nestedList = $createListNode(parentList.getListType());
    ownerItem.append(nestedList);
  }

  nestedList.append(listItemNode);

  if (parentList.isEmpty()) {
    const parentWrapper = parentList.getParent();
    parentList.remove();

    if (
      $isListItemNode(parentWrapper) &&
      $isEmptyListContainerItem(parentWrapper)
    ) {
      parentWrapper.remove();
    }
  }

  return true;
}
