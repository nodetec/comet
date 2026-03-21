import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent } from "@lexical/utils";
import { $isListItemNode, $isListNode, ListItemNode } from "@lexical/list";
import {
  $createTextNode,
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  TextNode,
} from "lexical";

import {
  $createListAnchorNode,
  $isListAnchorNode,
  ListAnchorNode,
} from "../nodes/list-anchor-node";

const LIST_MARKER_LAYOUT = {
  bullet: {
    before: 3,
    gap: 8,
    width: 10,
  },
  check: {
    before: 3,
    gap: 6,
    width: 16,
  },
  number: {
    before: 3,
    gap: 8,
    width: 24,
  },
} as const;

type MarkerListType = keyof typeof LIST_MARKER_LAYOUT;
type ListHitRegion = "before" | "marker" | "after" | null;

function getMarkerListType(node: ListItemNode): MarkerListType | null {
  const parent = node.getParent();
  if (!parent || !$isListNode(parent)) {
    return null;
  }

  const listType = parent.getListType();
  return listType === "bullet" || listType === "check" || listType === "number"
    ? listType
    : null;
}

function $getListAnchorNode(listItemNode: ListItemNode): ListAnchorNode | null {
  const firstChild = listItemNode.getFirstChild();
  return $isListAnchorNode(firstChild) ? firstChild : null;
}

function $getOrCreateListAnchorNode(
  listItemNode: ListItemNode,
): ListAnchorNode {
  const existing = $getListAnchorNode(listItemNode);
  if (existing) {
    return existing;
  }

  const anchor = $createListAnchorNode();
  const firstChild = listItemNode.getFirstChild();
  if (firstChild) {
    firstChild.insertBefore(anchor);
  } else {
    listItemNode.append(anchor);
  }
  return anchor;
}

function $getOrCreateTextAfterAnchor(anchor: ListAnchorNode): TextNode {
  const nextSibling = anchor.getNextSibling();
  if ($isTextNode(nextSibling) && !$isListAnchorNode(nextSibling)) {
    return nextSibling;
  }

  const textNode = $createTextNode("");
  anchor.insertAfter(textNode);
  return textNode;
}

function $moveSelectionBeforeMarker(listItemNode: ListItemNode): void {
  const anchor = $getOrCreateListAnchorNode(listItemNode);
  anchor.select(0, 0);
}

function $moveSelectionAfterMarker(listItemNode: ListItemNode): void {
  const anchor = $getOrCreateListAnchorNode(listItemNode);
  anchor.select(1, 1);
}

function $toggleChecklistItem(listItemNode: ListItemNode): void {
  if (getMarkerListType(listItemNode) === "check") {
    listItemNode.toggleChecked();
  }
}

function getListItemFromDomTarget(
  root: HTMLElement | null,
  target: EventTarget | null,
): HTMLLIElement | null {
  if (!(target instanceof HTMLElement) || !root?.contains(target)) {
    return null;
  }

  const listItem = target.closest("li.comet-list-item");
  return listItem instanceof HTMLLIElement ? listItem : null;
}

function getMarkerListTypeFromDom(
  listItem: HTMLLIElement,
): MarkerListType | null {
  if (listItem.classList.contains("comet-list-item--check")) {
    return "check";
  }

  const parentList = listItem.parentElement;
  if (!parentList) {
    return null;
  }

  if (parentList.classList.contains("comet-list--ordered")) {
    return "number";
  }

  if (parentList.classList.contains("comet-list--bullet")) {
    return "bullet";
  }

  if (parentList.classList.contains("comet-list--check")) {
    return "check";
  }

  return null;
}

function getClientX(event: Event): number | null {
  if ("clientX" in event && typeof event.clientX === "number") {
    return event.clientX;
  }

  if ("touches" in event) {
    const touchEvent = event as TouchEvent;
    if (touchEvent.touches.length > 0) {
      return touchEvent.touches[0]?.clientX ?? null;
    }
  }

  return null;
}

function getListHitRegion(
  listItem: HTMLLIElement,
  clientX: number,
): ListHitRegion {
  const listType = getMarkerListTypeFromDom(listItem);
  if (!listType) {
    return null;
  }

  const { before, gap, width } = LIST_MARKER_LAYOUT[listType];
  const localX = clientX - listItem.getBoundingClientRect().left;
  const markerStart = before;
  const markerEnd = before + width;
  const afterEnd = before + width + gap;

  if (localX < 0 || localX > afterEnd) {
    return null;
  }

  if (localX < markerStart) {
    return "before";
  }

  if (localX < markerEnd) {
    return "marker";
  }

  return "after";
}

function collectSelectedListItemKeys(): Set<string> {
  const nextKeys = new Set<string>();
  const selection = $getSelection();

  if (!$isRangeSelection(selection) || selection.isCollapsed()) {
    return nextKeys;
  }

  for (const node of selection.getNodes()) {
    const listItem = $isListItemNode(node)
      ? node
      : $findMatchingParent(node, $isListItemNode);
    if (!listItem || !getMarkerListType(listItem)) {
      continue;
    }

    nextKeys.add(listItem.getKey());
  }

  return nextKeys;
}

export default function ListCursorPlugin(): null {
  const [editor] = useLexicalComposerContext();
  const rootRef = useRef<HTMLElement | null>(null);
  const selectedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const syncSelectedListItems = () => {
      editor.getEditorState().read(() => {
        const nextKeys = collectSelectedListItemKeys();
        const prevKeys = selectedKeysRef.current;

        for (const key of prevKeys) {
          if (nextKeys.has(key)) {
            continue;
          }

          editor
            .getElementByKey(key)
            ?.classList.remove("comet-list-item--range-selected");
        }

        for (const key of nextKeys) {
          if (prevKeys.has(key)) {
            continue;
          }

          editor
            .getElementByKey(key)
            ?.classList.add("comet-list-item--range-selected");
        }

        selectedKeysRef.current = nextKeys;
      });
    };

    const removeListItemTransform = editor.registerNodeTransform(
      ListItemNode,
      (node) => {
        const anchor = $getListAnchorNode(node);
        if (!getMarkerListType(node)) {
          if (anchor) {
            anchor.remove();
          }
          return;
        }

        $getOrCreateListAnchorNode(node);
      },
    );

    const removeAnchorTransform = editor.registerNodeTransform(
      ListAnchorNode,
      (node) => {
        const parent = node.getParent();
        if (!parent || !$isListItemNode(parent) || !getMarkerListType(parent)) {
          node.remove();
          return;
        }

        const firstChild = parent.getFirstChild();
        if (firstChild !== node) {
          if (firstChild) {
            firstChild.insertBefore(node);
          }
          return;
        }

        const extraText = node.getAnchorText().replace(/\u200B/g, "");
        if (extraText.length === 0) {
          if (node.getAnchorText() !== "\u200B") {
            node.resetAnchorText();
          }
          return;
        }

        node.resetAnchorText();
        const nextSibling = node.getNextSibling();
        if ($isTextNode(nextSibling) && !$isListAnchorNode(nextSibling)) {
          nextSibling.setTextContent(extraText + nextSibling.getTextContent());
        } else {
          node.insertAfter($createTextNode(extraText));
        }
      },
    );

    const removeTextInsert = editor.registerCommand(
      CONTROLLED_TEXT_INSERTION_COMMAND,
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return false;
        }

        const anchorNode = selection.anchor.getNode();
        if (!$isListAnchorNode(anchorNode)) {
          return false;
        }

        const textNode = $getOrCreateTextAfterAnchor(anchorNode);
        selection.anchor.set(textNode.getKey(), 0, "text");
        selection.focus.set(textNode.getKey(), 0, "text");
        return false;
      },
      1,
    );

    const handlePointerDown = (
      event: PointerEvent | MouseEvent | TouchEvent,
    ) => {
      const listItem = getListItemFromDomTarget(rootRef.current, event.target);
      if (!listItem) {
        return;
      }

      const clientX = getClientX(event);
      if (clientX == null) {
        return;
      }

      const region = getListHitRegion(listItem, clientX);
      if (region) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const handleClick = (event: MouseEvent) => {
      const listItem = getListItemFromDomTarget(rootRef.current, event.target);
      if (!listItem) {
        return;
      }

      const clientX = getClientX(event);
      if (clientX == null) {
        return;
      }

      const region = getListHitRegion(listItem, clientX);
      if (!region) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      editor.update(() => {
        const node = $getNearestNodeFromDOMNode(listItem);
        if (!$isListItemNode(node) || !getMarkerListType(node)) {
          return;
        }

        if (region === "before") {
          $moveSelectionBeforeMarker(node);
          return;
        }

        if (region === "marker") {
          if (getMarkerListType(node) === "check") {
            $toggleChecklistItem(node);
            return;
          }

          $moveSelectionAfterMarker(node);
          return;
        }

        $moveSelectionAfterMarker(node);
      });
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("mousedown", handlePointerDown, true);
    window.addEventListener("touchstart", handlePointerDown, {
      capture: true,
      passive: false,
    });
    window.addEventListener("click", handleClick, true);

    const removeUpdateListener = editor.registerUpdateListener(() => {
      syncSelectedListItems();
    });

    const removeRootListener = editor.registerRootListener((root, prevRoot) => {
      rootRef.current = root;

      if (prevRoot) {
        for (const key of selectedKeysRef.current) {
          editor
            .getElementByKey(key)
            ?.classList.remove("comet-list-item--range-selected");
        }
        selectedKeysRef.current = new Set();
      }
    });

    syncSelectedListItems();

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("mousedown", handlePointerDown, true);
      window.removeEventListener("touchstart", handlePointerDown, true);
      window.removeEventListener("click", handleClick, true);

      for (const key of selectedKeysRef.current) {
        editor
          .getElementByKey(key)
          ?.classList.remove("comet-list-item--range-selected");
      }
      selectedKeysRef.current = new Set();

      removeListItemTransform();
      removeAnchorTransform();
      removeTextInsert();
      removeUpdateListener();
      removeRootListener();
    };
  }, [editor]);

  return null;
}
