import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent, mergeRegister } from "@lexical/utils";
import {
  COMMAND_PRIORITY_CRITICAL,
  $createRangeSelection,
  $isElementNode,
  $getNodeByKey,
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  $isTextNode,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_BACKSPACE_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type LexicalNode,
} from "lexical";
import { $isListItemNode, $isListNode, ListItemNode } from "@lexical/list";
import {
  findSingleCharacterChecklistTextNode,
  isEmptyChecklistLeafItem,
  normalizeChecklistItemMarker,
  removeExpandedChecklistSelection,
} from "../lib/checklist-marker";
import { $outdentListItemPreservingOrder } from "../lib/list-outdent";
import {
  isChecklistLeftCursorAnchorTextContent,
  CHECKLIST_CURSOR_ANCHOR,
  CHECKLIST_PLACEHOLDER,
  $convertChecklistItemToParagraph,
  isChecklistCursorAnchorTextContent,
  isChecklistPlaceholderTextContent,
} from "../lib/todo-shortcut";
import { $isListAnchorNode } from "../nodes/list-anchor-node";

function isChecklistListItem(
  node: LexicalNode | null | undefined,
): node is ListItemNode {
  if (!$isListItemNode(node)) {
    return false;
  }

  const parentList = node.getParent();
  return $isListNode(parentList) && parentList.getListType() === "check";
}

export default function ChecklistMarkerPlugin() {
  const [editor] = useLexicalComposerContext();
  const markerSelectionSnapshotRef = useRef<{
    anchorKey: string;
    anchorOffset: number;
    focusKey: string;
    focusOffset: number;
  } | null>(null);

  useEffect(() => {
    const setCollapsedSelectionOnTextNode = (
      textNode: import("lexical").TextNode,
      offset: number,
    ) => {
      const boundedOffset = Math.min(offset, textNode.getTextContentSize());
      const selection = $createRangeSelection();
      selection.setTextNodeRange(
        textNode,
        boundedOffset,
        textNode,
        boundedOffset,
      );
      $setSelection(selection);
    };

    const captureTextRangeSelection = () => {
      const selection = $getSelection();
      if (
        !$isRangeSelection(selection) ||
        selection.anchor.type !== "text" ||
        selection.focus.type !== "text"
      ) {
        return null;
      }

      return {
        anchorKey: selection.anchor.key,
        anchorOffset: selection.anchor.offset,
        focusKey: selection.focus.key,
        focusOffset: selection.focus.offset,
      };
    };

    const restoreTextRangeSelection = (
      snapshot: {
        anchorKey: string;
        anchorOffset: number;
        focusKey: string;
        focusOffset: number;
      } | null,
    ) => {
      if (snapshot == null) {
        return;
      }

      const anchorNode = $getNodeByKey(snapshot.anchorKey);
      const focusNode = $getNodeByKey(snapshot.focusKey);
      if (!$isTextNode(anchorNode) || !$isTextNode(focusNode)) {
        return;
      }

      const selection = $createRangeSelection();
      selection.setTextNodeRange(
        anchorNode,
        Math.min(snapshot.anchorOffset, anchorNode.getTextContentSize()),
        focusNode,
        Math.min(snapshot.focusOffset, focusNode.getTextContentSize()),
      );
      $setSelection(selection);
    };

    const syncChecklistMarkerSpacingText = (
      listItem: ListItemNode,
      textNode: import("lexical").TextNode,
    ) => {
      const expectedText = isEmptyChecklistLeafItem(listItem)
        ? CHECKLIST_PLACEHOLDER
        : CHECKLIST_CURSOR_ANCHOR;

      if (textNode.getTextContent() !== expectedText) {
        textNode.setTextContent(expectedText);
      }
    };

    const getChecklistEditingTextNode = (
      listItem: ListItemNode,
    ): import("lexical").TextNode | null => {
      let sawListAnchor = false;

      for (const child of listItem.getChildren()) {
        if ($isListAnchorNode(child)) {
          sawListAnchor = true;
          continue;
        }

        if ($isTextNode(child)) {
          if (
            !sawListAnchor &&
            isChecklistLeftCursorAnchorTextContent(child.getTextContent())
          ) {
            continue;
          }
          return child;
        }
      }

      return null;
    };

    const selectChecklistEditingPosition = (listItem: ListItemNode) => {
      const textNode = getChecklistEditingTextNode(listItem);
      if ($isTextNode(textNode)) {
        if (
          isChecklistPlaceholderTextContent(textNode.getTextContent()) ||
          isChecklistCursorAnchorTextContent(textNode.getTextContent())
        ) {
          syncChecklistMarkerSpacingText(listItem, textNode);
          setCollapsedSelectionOnTextNode(
            textNode,
            textNode.getTextContentSize(),
          );
          return;
        }

        setCollapsedSelectionOnTextNode(textNode, 0);
        return;
      }
      listItem.selectEnd();
    };

    const getChecklistItemFromNode = (
      node: LexicalNode,
    ): ListItemNode | null => {
      if (isChecklistListItem(node)) {
        return node;
      }

      const parent = $findMatchingParent(
        node,
        (candidate): candidate is ListItemNode =>
          isChecklistListItem(candidate),
      );
      return isChecklistListItem(parent) ? parent : null;
    };

    const getDeepestVisibleListItem = (
      listItem: ListItemNode,
    ): ListItemNode => {
      let current = listItem;

      while (true) {
        const nestedLists = current
          .getChildren()
          .filter((child): child is import("@lexical/list").ListNode =>
            $isListNode(child),
          );
        const [lastNestedList] = nestedLists.slice(-1);
        if (!lastNestedList) {
          return current;
        }

        const nestedItems = lastNestedList
          .getChildren()
          .filter($isListItemNode);
        const [lastNestedItem] = nestedItems.slice(-1);
        if (!lastNestedItem) {
          return current;
        }

        current = lastNestedItem;
      }
    };

    const getChecklistLineAbove = (
      listItem: ListItemNode,
    ): LexicalNode | null => {
      const previousSibling = listItem.getPreviousSibling();
      if ($isListItemNode(previousSibling)) {
        return getDeepestVisibleListItem(previousSibling);
      }

      const parentList = listItem.getParent();
      const ownerItem = parentList?.getParent();
      if ($isListItemNode(ownerItem)) {
        return ownerItem;
      }

      if (!$isListNode(parentList)) {
        return null;
      }

      const previousTopLevelSibling = parentList.getPreviousSibling();
      if ($isListNode(previousTopLevelSibling)) {
        const siblingItems = previousTopLevelSibling
          .getChildren()
          .filter($isListItemNode);
        const [lastSiblingItem] = siblingItems.slice(-1);
        return lastSiblingItem
          ? getDeepestVisibleListItem(lastSiblingItem)
          : null;
      }

      return previousTopLevelSibling;
    };

    const getFirstVisibleListItem = (
      listNode: import("@lexical/list").ListNode,
    ): ListItemNode | null => {
      const listItem = listNode.getChildren().find($isListItemNode);
      const firstListItem = listItem;
      if (!firstListItem) {
        return null;
      }

      let current = firstListItem;
      while (getChecklistEditingTextNode(current) == null) {
        const nestedList = current
          .getChildren()
          .find((child): child is import("@lexical/list").ListNode =>
            $isListNode(child),
          );
        if (!nestedList) {
          return current;
        }

        const nestedItem = nestedList.getChildren().find($isListItemNode);
        if (!nestedItem) {
          return current;
        }

        current = nestedItem;
      }

      return current;
    };

    const selectVisibleLineEnd = (node: LexicalNode) => {
      if (!isChecklistListItem(node)) {
        node.selectEnd();
        return;
      }

      const listItem = node;
      let lastDirectTextNode: import("lexical").TextNode | null = null;

      for (const child of listItem.getChildren()) {
        if ($isListNode(child)) {
          break;
        }

        if (
          $isTextNode(child) &&
          !isChecklistLeftCursorAnchorTextContent(child.getTextContent()) &&
          !isChecklistCursorAnchorTextContent(child.getTextContent())
        ) {
          lastDirectTextNode = child;
        }
      }

      if ($isTextNode(lastDirectTextNode)) {
        setCollapsedSelectionOnTextNode(
          lastDirectTextNode,
          lastDirectTextNode.getTextContentSize(),
        );
        return;
      }

      const editingTextNode = getChecklistEditingTextNode(listItem);
      if ($isTextNode(editingTextNode)) {
        setCollapsedSelectionOnTextNode(
          editingTextNode,
          editingTextNode.getTextContentSize(),
        );
        return;
      }

      listItem.selectEnd();
    };

    const isSelectionAtVisibleLineEnd = (
      selection: import("lexical").RangeSelection,
      node: LexicalNode,
    ): boolean => {
      if (
        selection.anchor.type === "element" &&
        selection.focus.type === "element" &&
        selection.anchor.key === selection.focus.key &&
        node.is(selection.anchor.getNode())
      ) {
        return (
          $isElementNode(node) &&
          selection.anchor.offset >= node.getChildrenSize()
        );
      }

      if (
        selection.anchor.type !== "text" ||
        selection.focus.type !== "text" ||
        selection.anchor.key !== selection.focus.key ||
        !$isElementNode(node)
      ) {
        return false;
      }

      const lastDescendant = node.getLastDescendant();
      return (
        $isTextNode(lastDescendant) &&
        selection.anchor.getNode().is(lastDescendant) &&
        selection.anchor.offset === lastDescendant.getTextContentSize()
      );
    };

    const getVisibleLineBelow = (node: LexicalNode): LexicalNode | null => {
      const currentLine = isChecklistListItem(node)
        ? node
        : node.getTopLevelElementOrThrow();
      const nextSibling = currentLine.getNextSibling();
      if ($isListNode(nextSibling)) {
        return getFirstVisibleListItem(nextSibling);
      }

      return nextSibling;
    };

    const selectVisibleLineStart = (node: LexicalNode) => {
      if (isChecklistListItem(node)) {
        selectChecklistEditingPosition(node);
        return;
      }

      node.selectStart();
    };

    const isCollapsedSelectionAtChecklistStart = (
      listItem: ListItemNode,
    ): boolean => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
        return false;
      }

      const anchorNode = selection.anchor.getNode();

      if (selection.anchor.type === "element") {
        return listItem.is(anchorNode) && selection.anchor.offset <= 1;
      }

      if (!$isTextNode(anchorNode)) {
        return false;
      }

      const owningListItem = getChecklistItemFromNode(anchorNode);
      if (owningListItem == null || !owningListItem.is(listItem)) {
        return false;
      }

      if (isChecklistCursorAnchorTextContent(anchorNode.getTextContent())) {
        return (
          selection.anchor.offset === 0 ||
          selection.anchor.offset === anchorNode.getTextContentSize()
        );
      }

      if (selection.anchor.offset !== 0) {
        return false;
      }

      const previousSibling = anchorNode.getPreviousSibling();
      return (
        ($isTextNode(previousSibling) &&
          isChecklistCursorAnchorTextContent(
            previousSibling.getTextContent(),
          )) ||
        $isListAnchorNode(previousSibling)
      );
    };

    const normalizeSelectionAwayFromChecklistMarker = (): boolean => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
        return false;
      }

      const anchorNode = selection.anchor.getNode();

      if (
        selection.anchor.type === "text" &&
        selection.focus.type === "text" &&
        selection.anchor.key === selection.focus.key &&
        $isListAnchorNode(anchorNode)
      ) {
        const nextSibling = anchorNode.getNextSibling();
        if (!$isTextNode(nextSibling)) {
          return false;
        }

        const offset =
          isChecklistCursorAnchorTextContent(nextSibling.getTextContent()) ||
          isChecklistPlaceholderTextContent(nextSibling.getTextContent())
            ? nextSibling.getTextContentSize()
            : 0;
        setCollapsedSelectionOnTextNode(nextSibling, offset);
        return true;
      }

      if (
        selection.anchor.type === "element" &&
        selection.focus.type === "element" &&
        selection.anchor.key === selection.focus.key &&
        isChecklistListItem(anchorNode)
      ) {
        if (selection.anchor.offset > 1) {
          return false;
        }

        const textNode = getChecklistEditingTextNode(anchorNode);
        if (!$isTextNode(textNode)) {
          return false;
        }

        const offset =
          isChecklistCursorAnchorTextContent(textNode.getTextContent()) ||
          isChecklistPlaceholderTextContent(textNode.getTextContent())
            ? textNode.getTextContentSize()
            : 0;
        setCollapsedSelectionOnTextNode(textNode, offset);
        return true;
      }

      return false;
    };

    const getChecklistListItemElement = (
      target: EventTarget | null,
    ): HTMLElement | null => {
      if (!(target instanceof HTMLElement)) {
        return null;
      }

      const listItemElement = target.closest(
        ".comet-list-item--check",
      ) as HTMLElement | null;
      return listItemElement instanceof HTMLElement ? listItemElement : null;
    };

    const getChecklistClickZone = (
      target: EventTarget | null,
      clientX: number,
      clientY: number,
    ): { listItemElement: HTMLElement; zone: "gutter" | "marker" } | null => {
      const listItemElement = getChecklistListItemElement(target);
      if (listItemElement == null) {
        return null;
      }

      const anchorElement = listItemElement.querySelector(
        ":scope > .comet-list-anchor",
      );
      if (!(anchorElement instanceof HTMLElement)) {
        return null;
      }

      const styles = window.getComputedStyle(listItemElement);
      const paddingLeft = Number.parseFloat(styles.paddingLeft);
      const markerWidth = Number.parseFloat(
        styles.getPropertyValue("--comet-list-marker-width"),
      );
      const listItemRect = listItemElement.getBoundingClientRect();
      const anchorRect = anchorElement.getBoundingClientRect();

      if (clientY < anchorRect.top || clientY > anchorRect.bottom) {
        return null;
      }

      const clickOffset = clientX - listItemRect.left;

      if (clickOffset <= markerWidth) {
        return { listItemElement, zone: "marker" };
      }

      if (clickOffset <= paddingLeft) {
        return { listItemElement, zone: "gutter" };
      }

      return null;
    };

    const handleMouseDown = (event: MouseEvent) => {
      const clickZone = getChecklistClickZone(
        event.target,
        event.clientX,
        event.clientY,
      );
      if (clickZone?.zone === "gutter") {
        event.preventDefault();
        event.stopPropagation();

        editor.update(() => {
          const node = $getNearestNodeFromDOMNode(clickZone.listItemElement);
          if (node == null) {
            return;
          }

          const listItem = getChecklistItemFromNode(node);
          if (listItem == null) {
            return;
          }

          selectChecklistEditingPosition(listItem);
        });

        queueMicrotask(() => {
          editor.focus();
        });
        return;
      }

      if (clickZone?.zone !== "marker") {
        return;
      }

      if (event.detail === 1) {
        editor.getEditorState().read(() => {
          markerSelectionSnapshotRef.current = captureTextRangeSelection();
        });
        event.preventDefault();
      }

      // Repeated clicks on inline text normally trigger browser word/line
      // selection. Suppress that default only for multi-clicks on the
      // checkbox marker so single-click toggle and drag selection still work.
      if (event.detail > 1) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const handleClick = (event: MouseEvent) => {
      const clickZone = getChecklistClickZone(
        event.target,
        event.clientX,
        event.clientY,
      );
      editor.update(() => {
        if (clickZone?.zone === "marker") {
          const node = $getNearestNodeFromDOMNode(clickZone.listItemElement);
          if (node == null) {
            return;
          }

          const listItem = getChecklistItemFromNode(node);
          if (listItem == null) {
            return;
          }

          const selection = $getSelection();
          if ($isRangeSelection(selection) && !selection.isCollapsed()) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          listItem.toggleChecked();
          restoreTextRangeSelection(markerSelectionSnapshotRef.current);
          markerSelectionSnapshotRef.current = null;
        }
      });
    };

    const handleExpandedChecklistBackspace = (
      selection: import("lexical").RangeSelection,
      event?: KeyboardEvent | null,
    ): boolean => {
      if (!removeExpandedChecklistSelection(selection)) {
        return false;
      }

      event?.preventDefault();
      return true;
    };

    const handleCollapsedChecklistBackspace = (
      selection: import("lexical").RangeSelection,
      event?: KeyboardEvent | null,
    ): boolean => {
      const anchorNode = selection.anchor.getNode();
      const listItem = getChecklistItemFromNode(anchorNode);
      if (listItem == null) {
        return false;
      }

      if (isCollapsedSelectionAtChecklistStart(listItem)) {
        event?.preventDefault();

        if (listItem.getChildren().some($isListNode)) {
          $convertChecklistItemToParagraph(listItem, "start");
        } else if ($outdentListItemPreservingOrder(listItem)) {
          selectChecklistEditingPosition(listItem);
        } else {
          $convertChecklistItemToParagraph(listItem, "start");
        }
        return true;
      }

      if (isEmptyChecklistLeafItem(listItem)) {
        event?.preventDefault();

        if (!$outdentListItemPreservingOrder(listItem)) {
          $convertChecklistItemToParagraph(listItem);
        }
        return true;
      }

      const singleCharacterNode =
        findSingleCharacterChecklistTextNode(listItem);
      if (singleCharacterNode == null) {
        return false;
      }

      const anchorInsideSameChecklistItem =
        singleCharacterNode.is(anchorNode) ||
        listItem.is(anchorNode) ||
        $findMatchingParent(
          anchorNode,
          (candidate): candidate is ListItemNode =>
            isChecklistListItem(candidate) && candidate.is(listItem),
        ) != null;

      if (!anchorInsideSameChecklistItem) {
        return false;
      }

      event?.preventDefault();
      singleCharacterNode.remove();
      normalizeChecklistItemMarker(listItem);
      selectChecklistEditingPosition(listItem);

      return true;
    };

    const handleChecklistLeftArrow = (
      event?: KeyboardEvent | null,
    ): boolean => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
        return false;
      }

      if (selection.anchor.type !== "text" || selection.focus.type !== "text") {
        return false;
      }

      const anchorNode = selection.anchor.getNode();
      if (
        !$isTextNode(anchorNode) ||
        !isChecklistCursorAnchorTextContent(anchorNode.getTextContent())
      ) {
        return false;
      }

      const listItem = getChecklistItemFromNode(anchorNode);
      if (listItem == null) {
        return false;
      }

      event?.preventDefault();
      const lineAbove = getChecklistLineAbove(listItem);
      if (lineAbove != null) {
        selectVisibleLineEnd(lineAbove);
      }
      return true;
    };

    const handleChecklistRightArrow = (
      event?: KeyboardEvent | null,
    ): boolean => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
        return false;
      }

      const anchorNode = selection.anchor.getNode();
      const currentLine = isChecklistListItem(anchorNode)
        ? anchorNode
        : anchorNode.getTopLevelElementOrThrow();
      if (!isSelectionAtVisibleLineEnd(selection, currentLine)) {
        return false;
      }

      const lineBelow = getVisibleLineBelow(currentLine);
      if (!isChecklistListItem(lineBelow)) {
        return false;
      }

      event?.preventDefault();
      selectVisibleLineStart(lineBelow);
      return true;
    };

    return mergeRegister(
      editor.registerNodeTransform(ListItemNode, (listItemNode) => {
        normalizeChecklistItemMarker(listItemNode);
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          normalizeSelectionAwayFromChecklistMarker();
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_ARROW_LEFT_COMMAND,
        (event) => handleChecklistLeftArrow(event),
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_ARROW_RIGHT_COMMAND,
        (event) => handleChecklistRightArrow(event),
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        (event) => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            return false;
          }

          if (!selection.isCollapsed()) {
            return handleExpandedChecklistBackspace(selection, event);
          }

          return handleCollapsedChecklistBackspace(selection, event);
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerRootListener((root, prevRoot) => {
        prevRoot?.removeEventListener("mousedown", handleMouseDown, true);
        prevRoot?.removeEventListener("click", handleClick);
        root?.addEventListener("mousedown", handleMouseDown, true);
        root?.addEventListener("click", handleClick);
      }),
      () => {
        editor
          .getRootElement()
          ?.removeEventListener("mousedown", handleMouseDown, true);
        editor.getRootElement()?.removeEventListener("click", handleClick);
      },
    );
  }, [editor]);

  return null;
}
