import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $isParagraphNode,
  COMMAND_PRIORITY_HIGH,
  KEY_MODIFIER_COMMAND,
} from "lexical";
import {
  $isListItemNode,
  $isListNode,
  INSERT_CHECK_LIST_COMMAND,
} from "@lexical/list";

/**
 * Cmd+T toggles a todo checkbox:
 * - On a checklist item → converts to plain paragraph
 * - On an empty paragraph or a paragraph with no line breaks →
 *   inserts a checklist item
 * - Otherwise → does nothing (avoids mangling multi-line content)
 */
export default function TodoShortcutPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_MODIFIER_COMMAND,
      (event: KeyboardEvent) => {
        if (event.key !== "t" || !(event.metaKey || event.ctrlKey)) {
          return false;
        }
        event.preventDefault();

        editor.update(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;

          const anchorNode = selection.anchor.getNode();

          // Walk up to find a ListItemNode
          let listItem = $isListItemNode(anchorNode)
            ? anchorNode
            : anchorNode.getParent();
          while (listItem && !$isListItemNode(listItem)) {
            listItem = listItem.getParent();
          }

          const parentList = listItem?.getParent();

          if (
            listItem &&
            $isListItemNode(listItem) &&
            $isListNode(parentList) &&
            parentList.getListType() === "check"
          ) {
            // Checklist item → plain paragraph
            const paragraph = $createParagraphNode();
            for (const child of listItem.getChildren()) {
              paragraph.append(child);
            }
            listItem.replace(paragraph);
            paragraph.selectEnd();
            return;
          }

          // Only allow on a standalone paragraph (no <br> line breaks inside)
          const topBlock = anchorNode.getTopLevelElementOrThrow();
          if (!$isParagraphNode(topBlock)) return;

          const hasLineBreak = topBlock
            .getChildren()
            .some((c) => c.getType() === "linebreak");
          if (hasLineBreak) return;

          // Insert checklist
          editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
        });

        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor]);

  return null;
}
