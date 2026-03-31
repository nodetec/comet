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
  type LexicalNode,
} from "lexical";
import { $isListItemNode, $isListNode, ListItemNode } from "@lexical/list";
import {
  findSingleCharacterChecklistTextNode,
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

  useEffect(() => {
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

    const selectChecklistEditingPosition = (listItem: ListItemNode) => {
      const children = listItem.getChildren();

      for (const child of children) {
        if ($isListAnchorNode(child)) {
          continue;
        }

        if ($isTextNode(child)) {
          if (
            isChecklistPlaceholderTextContent(child.getTextContent()) ||
            isChecklistCursorAnchorTextContent(child.getTextContent())
          ) {
            syncChecklistMarkerSpacingText(listItem, child);
            child.select(1, 1);
            return;
          }

          child.select(0, 0);
          return;
        }
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
        return selection.anchor.offset === anchorNode.getTextContentSize();
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

    const isMarkerTarget = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof HTMLElement)) {
        return null;
      }

      const marker = target.closest(".comet-list-anchor");
      return marker instanceof HTMLElement ? marker : null;
    };

    const getChecklistGutterTarget = (
      target: EventTarget | null,
      clientX: number,
    ): HTMLElement | null => {
      if (!(target instanceof HTMLElement)) {
        return null;
      }

      const listItemElement = target.closest(
        ".comet-list-item--check",
      ) as HTMLElement | null;
      if (listItemElement == null || target !== listItemElement) {
        return null;
      }

      const paddingLeft = Number.parseFloat(
        window.getComputedStyle(listItemElement).paddingLeft,
      );
      const clickOffset =
        clientX - listItemElement.getBoundingClientRect().left;
      return clickOffset <= paddingLeft ? listItemElement : null;
    };

    const handleMouseDown = (event: MouseEvent) => {
      const listItemElement = getChecklistGutterTarget(
        event.target,
        event.clientX,
      );
      if (listItemElement != null) {
        event.preventDefault();
        event.stopPropagation();

        editor.update(() => {
          const node = $getNearestNodeFromDOMNode(listItemElement);
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

      const marker = isMarkerTarget(event.target);
      if (!marker) {
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
      const marker = isMarkerTarget(event.target);
      editor.update(() => {
        if (marker) {
          const node = $getNearestNodeFromDOMNode(marker);
          if (!$isListAnchorNode(node)) {
            return;
          }

          const listItem = node.getParent();
          if (!isChecklistListItem(listItem)) {
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

    return mergeRegister(
      editor.registerNodeTransform(ListItemNode, (listItemNode) => {
        normalizeChecklistItemMarker(listItemNode);
      }),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        (event) => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
            return false;
          }

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
