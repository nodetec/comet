import { useLayoutEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $convertFromMarkdownString } from "@lexical/markdown";
import {
  $createParagraphNode,
  $getRoot,
  $setSelection,
  CLEAR_HISTORY_COMMAND,
  $createTextNode,
} from "lexical";
import { $isHeadingNode } from "@lexical/rich-text";
import { $createListItemNode, $createListNode } from "@lexical/list";
import { $importMarkdownFromHTML } from "../lib/markdown";
import { CHECKLIST_PLACEHOLDER } from "../lib/todo-shortcut";
import { TRANSFORMERS } from "../transformers";

interface InitialContentPluginProps {
  html: string | null;
  isNew: boolean;
  loadKey: string;
  markdown: string;
  onInitComplete(): void;
}

export default function InitialContentPlugin({
  html,
  isNew,
  loadKey,
  markdown,
  onInitComplete,
}: InitialContentPluginProps) {
  const [editor] = useLexicalComposerContext();
  const lastLoadKeyRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (lastLoadKeyRef.current === loadKey) {
      return;
    }
    lastLoadKeyRef.current = loadKey;

    let mode: string;
    if (isNew) {
      mode = "new";
    } else {
      mode = markdown.trim() ? "existing" : "empty";
    }
    if (import.meta.env.DEV) {
      console.log(
        `[editor:init] mode=${mode} markdown=${markdown.length} chars`,
      );
    }

    editor.update(
      () => {
        if (isNew && markdown === "- [ ] ") {
          // Checklist mode: create an empty checklist item directly
          const root = $getRoot();
          root.clear();
          const checkList = $createListNode("check");
          const checkItem = $createListItemNode(false);
          const placeholder = $createTextNode(CHECKLIST_PLACEHOLDER);
          checkItem.append(placeholder);
          checkList.append(checkItem);
          root.append(checkList);
          placeholder.select(0, 1);
        } else if (!markdown.trim()) {
          const root = $getRoot();
          root.clear();
          root.append($createParagraphNode());
          $setSelection(null);
        } else if (html) {
          // Use pre-rendered HTML from Rust backend (comrak)
          $importMarkdownFromHTML(html, markdown);
          if (isNew) {
            // Place cursor at end of heading for new notes
            const root = $getRoot();
            const firstChild = root.getFirstChild();
            if ($isHeadingNode(firstChild)) {
              firstChild.selectEnd();
            }
          } else {
            $setSelection(null);
          }
        } else {
          const root = $getRoot();
          root.clear();
          $convertFromMarkdownString(markdown, TRANSFORMERS);
          $setSelection(null);
        }

        const root = $getRoot();
        if (import.meta.env.DEV) {
          console.log(`[editor:init] imported ${root.getChildrenSize()} nodes`);
        }
      },
      // Use discrete so the update settles synchronously before onInitComplete.
      // This ensures the OnChangeMarkdownPlugin baseline is recorded from the
      // post-import state, not the pre-import state.
      { discrete: true },
    );
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, void 0);

    onInitComplete();
  }, [editor, html, isNew, loadKey, markdown, onInitComplete]);

  return null;
}
