import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, $setSelection } from "lexical";
import { $isHeadingNode } from "@lexical/rich-text";
import { $createListItemNode, $createListNode } from "@lexical/list";
import { $importMarkdown } from "../lib/markdown";

interface InitialContentPluginProps {
  isNew: boolean;
  markdown: string;
  onInitComplete(): void;
}

export default function InitialContentPlugin({
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
        if (isNew) {
          if (markdown === "- [ ] ") {
            // Todo mode: create an empty checklist item directly
            // (marked can't parse "- [ ] " without text after it)
            const root = $getRoot();
            root.clear();
            const checkList = $createListNode("check");
            const checkItem = $createListItemNode(false);
            checkList.append(checkItem);
            root.append(checkList);
            checkItem.selectEnd();
          } else {
            // Normal new note: import markdown and place cursor at heading end
            $importMarkdown(markdown);
            const root = $getRoot();
            const firstChild = root.getFirstChild();
            if ($isHeadingNode(firstChild)) {
              firstChild.selectEnd();
            }
          }
        } else if (!markdown.trim()) {
          // Empty existing note: leave the default empty paragraph.
          // (Lexical initializes with one ParagraphNode by default.)
          $setSelection(null);
        } else {
          $importMarkdown(markdown);
          $setSelection(null);
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
  }, [editor, isNew, markdown, onInitComplete]);

  return null;
}
