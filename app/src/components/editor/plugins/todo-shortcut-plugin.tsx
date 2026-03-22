import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $isParagraphNode,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_MODIFIER_COMMAND,
  TextNode,
} from "lexical";
import {
  $isListItemNode,
  $isListNode,
  INSERT_CHECK_LIST_COMMAND,
} from "@lexical/list";
import { $isListAnchorNode } from "../nodes/list-anchor-node";
import {
  $collapseChecklistPlaceholderSelection,
  $convertChecklistParagraphToNestedItem,
  $convertNestedChecklistItemToParagraph,
  $normalizeChecklistPlaceholderTextNode,
  $replaceEmptyParagraphWithChecklist,
  stripChecklistPlaceholders,
} from "../lib/todo-shortcut";

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
    return mergeRegister(
      editor.registerNodeTransform(TextNode, (textNode) => {
        $normalizeChecklistPlaceholderTextNode(textNode);
      }),
      editor.registerCommand(
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
            let paragraphNode = $isParagraphNode(anchorNode)
              ? anchorNode
              : anchorNode.getParent();
            while (paragraphNode && !$isParagraphNode(paragraphNode)) {
              paragraphNode = paragraphNode.getParent();
            }

            if (
              $isParagraphNode(paragraphNode) &&
              $convertChecklistParagraphToNestedItem(paragraphNode)
            ) {
              return;
            }

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
              if (
                $isListItemNode(parentList.getParent()) &&
                $convertNestedChecklistItemToParagraph(listItem)
              ) {
                return;
              }

              // Checklist item → plain paragraph
              const paragraph = $createParagraphNode();
              let hasVisibleContent = false;
              for (const child of listItem.getChildren()) {
                if ($isListAnchorNode(child)) continue;
                if ($isTextNode(child)) {
                  const text = stripChecklistPlaceholders(
                    child.getTextContent(),
                  );
                  if (text.length === 0) {
                    continue;
                  }

                  if (text !== child.getTextContent()) {
                    child.setTextContent(text);
                  }
                }

                paragraph.append(child);
                hasVisibleContent = true;
              }
              listItem.replace(paragraph);
              if (hasVisibleContent) {
                paragraph.selectEnd();
              } else {
                paragraph.selectStart();
              }
              return;
            }

            // Only allow on a standalone paragraph (no <br> line breaks inside)
            const topBlock = anchorNode.getTopLevelElementOrThrow();
            if (!$isParagraphNode(topBlock)) return;

            const hasLineBreak = topBlock
              .getChildren()
              .some((c) => c.getType() === "linebreak");
            if (hasLineBreak) return;

            if (
              stripChecklistPlaceholders(topBlock.getTextContent()).length === 0
            ) {
              if ($replaceEmptyParagraphWithChecklist(topBlock)) {
                queueMicrotask(() => {
                  editor.update(() => {
                    $collapseChecklistPlaceholderSelection();
                  });
                });
              }
              return;
            }

            // Insert checklist
            editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND);
          });

          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor]);

  return null;
}
