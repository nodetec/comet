import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { TRANSFORMERS } from "../transformers";
import { $exportMarkdown } from "../lib/markdown";

interface OnChangeMarkdownPluginProps {
  onChange(markdown: string): void;
}

export default function OnChangeMarkdownPlugin({
  onChange,
}: OnChangeMarkdownPluginProps) {
  const [editor] = useLexicalComposerContext();
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;

      editorState.read(() => {
        const markdown = $exportMarkdown(TRANSFORMERS);
        onChangeRef.current(markdown);
      });
    });
  }, [editor]);

  return null;
}
