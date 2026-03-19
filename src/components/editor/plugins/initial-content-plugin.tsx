import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, $setSelection } from "lexical";
import { $isHeadingNode } from "@lexical/rich-text";
import { $createListItemNode, $createListNode } from "@lexical/list";
import { $importMarkdownFromHTML } from "../lib/markdown";

interface InitialContentPluginProps {
  html: string | null;
  isNew: boolean;
  markdown: string;
  onInitComplete(): void;
}

export default function InitialContentPlugin({
  html,
  isNew,
  markdown,
  onInitComplete,
}: InitialContentPluginProps) {
  const [editor] = useLexicalComposerContext();
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const mode = isNew ? "new" : !markdown.trim() ? "empty" : "existing";
    console.log(`[editor:init] mode=${mode} markdown=${markdown.length} chars`);

    editor.update(
      () => {
        if (isNew && markdown === "- [ ] ") {
          // Todo mode: create an empty checklist item directly
          const root = $getRoot();
          root.clear();
          const checkList = $createListNode("check");
          const checkItem = $createListItemNode(false);
          checkList.append(checkItem);
          root.append(checkList);
          checkItem.selectEnd();
        } else if (!markdown.trim()) {
          // Empty existing note: leave the default empty paragraph.
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
        }

        const root = $getRoot();
        console.log(`[editor:init] imported ${root.getChildrenSize()} nodes`);
      },
      // Use discrete so the update settles synchronously before onInitComplete.
      // This ensures the OnChangeMarkdownPlugin baseline is recorded from the
      // post-import state, not the pre-import state.
      { discrete: true },
    );

    onInitComplete();
  }, [editor, html, isNew, markdown, onInitComplete]);

  return null;
}
