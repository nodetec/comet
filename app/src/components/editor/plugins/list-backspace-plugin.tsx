import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  COMMAND_PRIORITY_HIGH,
  KEY_BACKSPACE_COMMAND,
} from "lexical";
import { $isListItemNode } from "@lexical/list";
import { $isCheckboxNode } from "../nodes/checkbox-node";

export default function ListBackspacePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event) => {
        const selection = $getSelection();

        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return false;
        }

        const anchorNode = selection.anchor.getNode();
        const anchorOffset = selection.anchor.offset;

        // Find the list item
        let listItemNode = $isListItemNode(anchorNode)
          ? anchorNode
          : anchorNode.getParent();
        while (listItemNode && !$isListItemNode(listItemNode)) {
          listItemNode = listItemNode.getParent();
        }
        if (!$isListItemNode(listItemNode)) {
          return false;
        }

        // Determine if cursor is at the "start" of the list item's content.
        // With CheckboxNode as the first child, "start" can mean:
        // 1. Element offset 0 in the ListItemNode (before checkbox)
        // 2. Element offset 1 in the ListItemNode (after checkbox, before text)
        // 3. Text offset 0 in the first text node after the checkbox
        // 4. On the CheckboxNode itself
        let atStart = false;

        if ($isCheckboxNode(anchorNode)) {
          atStart = true;
        } else if ($isListItemNode(anchorNode)) {
          // Element-level selection in the list item
          const childAtOffset = anchorNode.getChildAtIndex(anchorOffset);
          const childBefore =
            anchorOffset > 0
              ? anchorNode.getChildAtIndex(anchorOffset - 1)
              : null;
          atStart =
            anchorOffset === 0 ||
            $isCheckboxNode(childAtOffset) ||
            (anchorOffset === 1 && $isCheckboxNode(childBefore));
        } else if (anchorOffset === 0) {
          // Text offset 0 — check if previous sibling is a checkbox
          const prevSibling = anchorNode.getPreviousSibling();
          atStart = prevSibling === null || $isCheckboxNode(prevSibling);
        }

        if (!atStart) {
          return false;
        }

        // Get current indent level
        const currentIndent = listItemNode.getIndent();

        // If nested, outdent instead of converting to paragraph
        if (currentIndent > 0) {
          event?.preventDefault();
          listItemNode.setIndent(currentIndent - 1);
          return true;
        }

        // Convert to paragraph with content (stripping CheckboxNode)
        event?.preventDefault();
        const paragraph = $createParagraphNode();

        const children = listItemNode.getChildren();
        children.forEach((child) => {
          if (!$isCheckboxNode(child)) {
            paragraph.append(child);
          }
        });

        listItemNode.replace(paragraph);
        paragraph.selectStart();

        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor]);

  return null;
}
