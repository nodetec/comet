import {
  $isListItemNode,
  $isListNode,
  type ListItemNode,
  type ListNode,
} from "@lexical/list";
import {
  $isParagraphNode,
  $isTextNode,
  $createTextNode,
  type LexicalNode,
} from "lexical";
import {
  $createListAnchorNode,
  getChecklistMarkerText,
  $isListAnchorNode,
  type ListAnchorNode,
} from "../nodes/list-anchor-node";
import {
  CHECKLIST_PLACEHOLDER,
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
    const children = node.getChildren();
    return (
      children.length === 0 ||
      (children.length === 1 &&
        $isTextNode(children[0]) &&
        /^\s*$/.test(children[0].getTextContent()))
    );
  }

  if ($isTextNode(node)) {
    const text = node.getTextContent();
    return text !== CHECKLIST_PLACEHOLDER && /^\s*$/.test(text);
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

function isPlaceholderTextNode(node: LexicalNode): boolean {
  return $isTextNode(node) && node.getTextContent() === CHECKLIST_PLACEHOLDER;
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

function clearChecklistMarkerArtifacts(
  anchors: ListAnchorNode[],
  placeholderNodes: LexicalNode[],
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

  const firstChild = listItemNode.getFirstChild();
  if (firstChild && !firstChild.is(primaryAnchor)) {
    firstChild.insertBefore(primaryAnchor);
    changed = true;
  }

  const expectedAnchorText = getChecklistMarkerText();
  if (primaryAnchor.getAnchorText() !== expectedAnchorText) {
    primaryAnchor.setAnchorText(expectedAnchorText);
    changed = true;
  }

  return { changed, primaryAnchor };
}

function syncPlaceholderNodes(
  primaryAnchor: ListAnchorNode,
  placeholderNodes: LexicalNode[],
  shouldKeepPlaceholder: boolean,
): boolean {
  if (!shouldKeepPlaceholder) {
    return removeNodes(placeholderNodes);
  }

  let changed = false;
  const primaryPlaceholder = placeholderNodes[0] ?? null;
  if (primaryPlaceholder == null) {
    primaryAnchor.insertAfter($createTextNode(CHECKLIST_PLACEHOLDER));
    changed = true;
  } else {
    primaryAnchor.insertAfter(primaryPlaceholder);
  }

  return removeNodes(placeholderNodes.slice(1)) || changed;
}

export function normalizeChecklistItemMarker(
  listItemNode: ListItemNode,
): boolean {
  const anchors = listAnchorChildren(listItemNode);
  const placeholderNodes = listItemNode
    .getChildren()
    .filter(isPlaceholderTextNode);

  if (!shouldChecklistItemHaveMarker(listItemNode)) {
    return clearChecklistMarkerArtifacts(anchors, placeholderNodes);
  }

  const { changed: anchorChanged, primaryAnchor } = ensurePrimaryAnchor(
    listItemNode,
    anchors,
  );
  const placeholderChanged = syncPlaceholderNodes(
    primaryAnchor,
    placeholderNodes,
    !hasMeaningfulChecklistContent(listItemNode) &&
      !listItemNode.getChildren().some($isListNode),
  );

  return anchorChanged || placeholderChanged;
}

export function $isChecklistListItem(
  node: LexicalNode | null | undefined,
): node is ListItemNode {
  if (!$isListItemNode(node)) {
    return false;
  }

  return isChecklistList(node.getParent());
}
