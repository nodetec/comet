import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_BACKSPACE_COMMAND,
} from "lexical";
import { $isListItemNode } from "@lexical/list";
import { $isListAnchorNode } from "../nodes/list-anchor-node";

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
        const firstChild = listItemNode.getFirstChild();
        const prevSibling =
          selection.anchor.type === "text" && $isTextNode(anchorNode)
            ? anchorNode.getPreviousSibling()
            : null;
        const atStart =
          ($isListItemNode(anchorNode) &&
            selection.anchor.type === "element" &&
            (anchorOffset === 0 ||
              (anchorOffset === 1 && $isListAnchorNode(firstChild)))) ||
          ($isListAnchorNode(anchorNode) && selection.anchor.type === "text") ||
          (selection.anchor.type === "text" &&
            anchorOffset === 0 &&
            (listItemNode.getFirstDescendant() === anchorNode ||
              $isListAnchorNode(prevSibling)));

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

        // Convert to paragraph with content.
        event?.preventDefault();
        const paragraph = $createParagraphNode();

        const children = listItemNode.getChildren();
        children.forEach((child) => {
          if ($isListAnchorNode(child)) return;
          paragraph.append(child);
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
