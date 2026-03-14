import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, $setSelection } from "lexical";
import { $createHeadingNode, $isHeadingNode } from "@lexical/rich-text";
import { TRANSFORMERS } from "../transformers";
import { $importMarkdown } from "../lib/markdown";

// The Lexical markdown heading transformer requires text after "# ",
// so empty headings don't survive a round-trip. This normalizes
// bare heading markers ("# ", "## ", etc.) so they parse correctly.
function normalizeEmptyHeadings(markdown: string): string {
  return markdown.replace(/^(#{1,6})\s*$/gm, "$1 \u200B");
}

interface InitialContentPluginProps {
  isNew: boolean;
  markdown: string;
}

export default function InitialContentPlugin({
  isNew,
  markdown,
}: InitialContentPluginProps) {
  const [editor] = useLexicalComposerContext();
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    editor.update(() => {
      if (isNew) {
        // New note: always start with an empty H1.
        const root = $getRoot();
        root.clear();
        const heading = $createHeadingNode("h1");
        root.append(heading);

        if (markdown) {
          // Convert tag content, then prepend the heading.
          $importMarkdown(markdown, TRANSFORMERS);
          const firstChild = $getRoot().getFirstChild();
          if (firstChild && !$isHeadingNode(firstChild)) {
            firstChild.insertBefore(heading);
          }
        }

        heading.selectEnd();
      } else if (!markdown.trim()) {
        // Empty note: start with an H1 like a new note.
        const root = $getRoot();
        root.clear();
        root.append($createHeadingNode("h1"));
        $setSelection(null);
      } else {
        $importMarkdown(normalizeEmptyHeadings(markdown), TRANSFORMERS);
        $setSelection(null);
      }
    });
  }, [editor, isNew, markdown]);

  return null;
}
