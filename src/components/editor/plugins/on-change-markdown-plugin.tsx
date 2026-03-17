import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey } from "lexical";
import { TRANSFORMERS } from "../transformers";
import { $exportMarkdown } from "../lib/markdown";

interface OnChangeMarkdownPluginProps {
  initComplete: boolean;
  onChange(markdown: string): void;
}

export default function OnChangeMarkdownPlugin({
  initComplete,
  onChange,
}: OnChangeMarkdownPluginProps) {
  const [editor] = useLexicalComposerContext();
  const onChangeRef = useRef(onChange);
  const prevMarkdownRef = useRef<string | null>(null);
  const initCompleteRef = useRef(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // When initComplete flips to true, record the baseline markdown so
  // subsequent updates can detect real changes vs. init normalization.
  useEffect(() => {
    if (initComplete && !initCompleteRef.current) {
      initCompleteRef.current = true;
      editor.getEditorState().read(() => {
        const markdown = $exportMarkdown(TRANSFORMERS);
        prevMarkdownRef.current = markdown;
        console.log(
          `[editor:update] init complete, baseline: ${markdown.length} chars`,
        );
      });
    }
  }, [editor, initComplete]);

  useEffect(() => {
    return editor.registerUpdateListener(
      ({ editorState, dirtyElements, dirtyLeaves, tags }) => {
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;

        editorState.read(() => {
          const dirtyNodeSummary = Array.from(dirtyLeaves)
            .slice(0, 5)
            .map((key) => {
              const node = $getNodeByKey(key);
              return node
                ? `${node.getType()}(${JSON.stringify(node.getTextContent().slice(0, 30))})`
                : `?(${key})`;
            });

          console.log(
            `[editor:update] dirty: ${dirtyElements.size} elements, ${dirtyLeaves.size} leaves, tags: [${Array.from(tags).join(",")}]`,
            dirtyNodeSummary,
          );

          if (!initCompleteRef.current) {
            console.log(
              "[editor:update] pre-init update, skipping onChange",
            );
            return;
          }

          const markdown = $exportMarkdown(TRANSFORMERS);

          if (prevMarkdownRef.current !== null && prevMarkdownRef.current === markdown) {
            console.log("[editor:update] markdown unchanged, skipping onChange");
            return;
          }

          if (prevMarkdownRef.current !== null) {
            const prevLen = prevMarkdownRef.current.length;
            const nextLen = markdown.length;
            console.log(
              `[editor:update] markdown changed: ${prevLen} → ${nextLen} chars (${nextLen >= prevLen ? "+" : ""}${nextLen - prevLen})`,
            );
          }

          prevMarkdownRef.current = markdown;
          onChangeRef.current(markdown);
        });
      },
    );
  }, [editor]);

  return null;
}
