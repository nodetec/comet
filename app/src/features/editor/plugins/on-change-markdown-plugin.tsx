import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { TRANSFORMERS } from "../transformers";
import { $exportMarkdown } from "../lib/markdown";
import { createMarkdownChangeTracker } from "../lib/note-load-state";

interface OnChangeMarkdownPluginProps {
  initVersion: number;
  loadKey: string;
  onChange(markdown: string): void;
}

export default function OnChangeMarkdownPlugin({
  initVersion,
  loadKey,
  onChange,
}: OnChangeMarkdownPluginProps) {
  const [editor] = useLexicalComposerContext();
  const onChangeRef = useRef(onChange);
  const trackerRef = useRef(createMarkdownChangeTracker());

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    trackerRef.current.resetForLoad();
  }, [loadKey]);

  // When a new document load completes, record a fresh baseline so updates
  // compare against the current note rather than the previous one.
  useEffect(() => {
    if (initVersion === 0) {
      return;
    }

    editor.getEditorState().read(() => {
      const markdown = $exportMarkdown(TRANSFORMERS);
      trackerRef.current.setBaseline(markdown);
    });
  }, [editor, initVersion]);

  useEffect(() => {
    return editor.registerUpdateListener(
      ({ editorState, dirtyElements, dirtyLeaves }) => {
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;

        editorState.read(() => {
          const markdown = $exportMarkdown(TRANSFORMERS);
          const changedMarkdown = trackerRef.current.consume(markdown);
          if (changedMarkdown === null) {
            return;
          }

          onChangeRef.current(changedMarkdown);
        });
      },
    );
  }, [editor]);

  return null;
}
