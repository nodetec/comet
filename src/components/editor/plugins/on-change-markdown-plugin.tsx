import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
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
      });
    }
  }, [editor, initComplete]);

  useEffect(() => {
    return editor.registerUpdateListener(
      ({ editorState, dirtyElements, dirtyLeaves }) => {
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;

        editorState.read(() => {
          if (!initCompleteRef.current) {
            return;
          }

          const markdown = $exportMarkdown(TRANSFORMERS);

          if (
            prevMarkdownRef.current !== null &&
            prevMarkdownRef.current === markdown
          ) {
            return;
          }

          prevMarkdownRef.current = markdown;
          onChangeRef.current(markdown);
        });
      },
    );
  }, [editor]);

  return null;
}
