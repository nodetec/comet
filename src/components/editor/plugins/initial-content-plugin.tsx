import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, $setSelection } from "lexical";
import { $isHeadingNode } from "@lexical/rich-text";
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

    editor.update(() => {
      if (isNew) {
        // New note: markdown already contains "# " (with optional tags).
        // Import it and place the cursor at the end of the heading.
        $importMarkdown(markdown);
        const root = $getRoot();
        const firstChild = root.getFirstChild();
        if ($isHeadingNode(firstChild)) {
          firstChild.selectEnd();
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
    });

    onInitComplete();
  }, [editor, isNew, markdown, onInitComplete]);

  return null;
}
