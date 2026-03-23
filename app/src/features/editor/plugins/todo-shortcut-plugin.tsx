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
  // eslint-disable-next-line sonarjs/deprecation -- KEY_MODIFIER_COMMAND has no non-deprecated replacement in Lexical
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
 * Cmd+T toggles a checklist checkbox:
 * - On a checklist item -> converts to plain paragraph
 * - On an empty paragraph or a paragraph with no line breaks ->
 *   inserts a checklist item
 * - Otherwise -> does nothing (avoids mangling multi-line content)
 */
function $convertChecklistItemToParagraph(
  listItem: import("@lexical/list").ListItemNode,
): void {
  const paragraph = $createParagraphNode();
  let hasVisibleContent = false;
  for (const child of listItem.getChildren()) {
    if ($isListAnchorNode(child)) continue;
    if ($isTextNode(child)) {
      const text = stripChecklistPlaceholders(child.getTextContent());
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
}

function $findAncestorParagraph(
  node: import("lexical").LexicalNode,
): import("lexical").ParagraphNode | null {
  let current = $isParagraphNode(node) ? node : node.getParent();
  while (current && !$isParagraphNode(current)) {
    current = current.getParent();
  }
  return $isParagraphNode(current) ? current : null;
}

function $findAncestorChecklistItem(
  node: import("lexical").LexicalNode,
): import("@lexical/list").ListItemNode | null {
  let current = $isListItemNode(node) ? node : node.getParent();
  while (current && !$isListItemNode(current)) {
    current = current.getParent();
  }
  return $isListItemNode(current) ? current : null;
}

function $handleToggleChecklist(editor: import("lexical").LexicalEditor): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;

  const anchorNode = selection.anchor.getNode();

  // Try converting paragraph to nested checklist item
  const paragraphNode = $findAncestorParagraph(anchorNode);
  if (paragraphNode && $convertChecklistParagraphToNestedItem(paragraphNode)) {
    return;
  }

  // Try converting checklist item to paragraph
  const listItem = $findAncestorChecklistItem(anchorNode);
  const parentList = listItem?.getParent();

  if (
    listItem &&
    $isListNode(parentList) &&
    parentList.getListType() === "check"
  ) {
    if (
      $isListItemNode(parentList.getParent()) &&
      $convertNestedChecklistItemToParagraph(listItem)
    ) {
      return;
    }
    $convertChecklistItemToParagraph(listItem);
    return;
  }

  // Only allow on a standalone paragraph (no <br> line breaks inside)
  const topBlock = anchorNode.getTopLevelElementOrThrow();
  if (!$isParagraphNode(topBlock)) return;

  const hasLineBreak = topBlock
    .getChildren()
    .some((c) => c.getType() === "linebreak");
  if (hasLineBreak) return;

  if (stripChecklistPlaceholders(topBlock.getTextContent()).length === 0) {
    if ($replaceEmptyParagraphWithChecklist(topBlock)) {
      queueMicrotask(() => {
        editor.update(() => {
          $collapseChecklistPlaceholderSelection();
        });
      });
    }
    return;
  }

  editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, void 0);
}

export default function TodoShortcutPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerNodeTransform(TextNode, (textNode) => {
        $normalizeChecklistPlaceholderTextNode(textNode);
      }),
      editor.registerCommand(
        KEY_MODIFIER_COMMAND, // eslint-disable-line sonarjs/deprecation -- no non-deprecated replacement
        (event: KeyboardEvent) => {
          if (event.key !== "t" || !(event.metaKey || event.ctrlKey)) {
            return false;
          }
          event.preventDefault();
          editor.update(() => $handleToggleChecklist(editor));
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor]);

  return null;
}
