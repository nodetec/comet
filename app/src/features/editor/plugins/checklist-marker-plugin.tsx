import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent, mergeRegister } from "@lexical/utils";
import {
  COMMAND_PRIORITY_CRITICAL,
  $createRangeSelection,
  $getNodeByKey,
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  $isTextNode,
  KEY_BACKSPACE_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type LexicalNode,
} from "lexical";
import { $isListItemNode, $isListNode, ListItemNode } from "@lexical/list";
import {
  findSingleCharacterChecklistTextNode,
  getChecklistItemsWithSelectedMarkers,
  isEmptyChecklistLeafItem,
  normalizeChecklistItemMarker,
} from "../lib/checklist-marker";
import { $outdentListItemPreservingOrder } from "../lib/list-outdent";
import {
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
  const rangeSelectionTouchesMarkerRef = useRef(false);

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
      for (const child of listItem.getChildren()) {
        if ($isListAnchorNode(child)) {
          continue;
        }

        if ($isTextNode(child)) {
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
        selection.anchor.key === selection.focus.key
      ) {
        const listItem = getChecklistItemFromNode(anchorNode);
        if (listItem == null || selection.anchor.offset > 1) {
          return false;
        }

        const textNode = getChecklistEditingTextNode(listItem);
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
    ): { listItemElement: HTMLElement; zone: "gutter" | "marker" } | null => {
      const listItemElement = getChecklistListItemElement(target);
      if (listItemElement == null) {
        return null;
      }

      const styles = window.getComputedStyle(listItemElement);
      const paddingLeft = Number.parseFloat(styles.paddingLeft);
      const markerWidth = Number.parseFloat(
        styles.getPropertyValue("--comet-list-marker-width"),
      );
      const clickOffset =
        clientX - listItemElement.getBoundingClientRect().left;

      if (clickOffset <= markerWidth) {
        return { listItemElement, zone: "marker" };
      }

      if (clickOffset <= paddingLeft) {
        return { listItemElement, zone: "gutter" };
      }

      return null;
    };

    const handleMouseDown = (event: MouseEvent) => {
      const clickZone = getChecklistClickZone(event.target, event.clientX);
      rangeSelectionTouchesMarkerRef.current = clickZone?.zone === "marker";
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

    const handleMouseUp = (event: MouseEvent) => {
      const clickZone = getChecklistClickZone(event.target, event.clientX);
      rangeSelectionTouchesMarkerRef.current =
        rangeSelectionTouchesMarkerRef.current || clickZone?.zone === "marker";
    };

    const handleClick = (event: MouseEvent) => {
      const clickZone = getChecklistClickZone(event.target, event.clientX);
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
      const selectedChecklistItems =
        getChecklistItemsWithSelectedMarkers(selection);
      if (selectedChecklistItems.length === 0) {
        return false;
      }

      event?.preventDefault();
      selection.removeText();

      for (const listItem of selectedChecklistItems) {
        if (!listItem.isAttached() || !isChecklistListItem(listItem)) {
          continue;
        }

        if (rangeSelectionTouchesMarkerRef.current) {
          $convertChecklistItemToParagraph(listItem, "start");
        } else {
          normalizeChecklistItemMarker(listItem);
        }
      }

      rangeSelectionTouchesMarkerRef.current = false;
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

    return mergeRegister(
      editor.registerNodeTransform(ListItemNode, (listItemNode) => {
        normalizeChecklistItemMarker(listItemNode);
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || selection.isCollapsed()) {
            rangeSelectionTouchesMarkerRef.current = false;
          }
          normalizeSelectionAwayFromChecklistMarker();
          return false;
        },
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
        prevRoot?.removeEventListener("mouseup", handleMouseUp, true);
        prevRoot?.removeEventListener("click", handleClick);
        root?.addEventListener("mousedown", handleMouseDown, true);
        root?.addEventListener("mouseup", handleMouseUp, true);
        root?.addEventListener("click", handleClick);
      }),
      () => {
        rangeSelectionTouchesMarkerRef.current = false;
        editor
          .getRootElement()
          ?.removeEventListener("mousedown", handleMouseDown, true);
        editor
          .getRootElement()
          ?.removeEventListener("mouseup", handleMouseUp, true);
        editor.getRootElement()?.removeEventListener("click", handleClick);
      },
    );
  }, [editor]);

  return null;
}
