import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_BACKSPACE_COMMAND,
} from "lexical";
import { $isHeadingNode } from "@lexical/rich-text";

/**
 * Converts a heading to a paragraph when backspace is pressed at the
 * start of the heading, matching the behavior users expect from other
 * editors.
 */
export default function HeadingBackspacePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return false;
        }

        if (selection.anchor.offset !== 0) {
          return false;
        }

        const anchorNode = selection.anchor.getNode();
        const topElement = anchorNode.getTopLevelElementOrThrow();

        if (!$isHeadingNode(topElement)) {
          return false;
        }

        // Cursor is at the very start of the heading — convert to paragraph.
        event?.preventDefault();
        const paragraph = $createParagraphNode();
        for (const child of topElement.getChildren()) {
          paragraph.append(child);
        }
        topElement.replace(paragraph);
        paragraph.selectStart();
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor]);

  return null;
}
