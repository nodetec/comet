import { CodeNode } from "@lexical/code";
import { HashtagNode } from "@lexical/hashtag";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { $convertFromMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import {
  LexicalComposer,
  type InitialConfigType,
} from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { useActiveNote } from "~/hooks/useActiveNote";
import { useAppState } from "~/store";
import { $setSelection, type EditorState, type LexicalEditor } from "lexical";

import { useSaveNote } from "../hooks/useSaveNote";
import { CustomHashtagPlugin } from "../plugins/CustomHashtagPlugin";
import { OnBlurPlugin } from "../plugins/OnBlurPlugin";
import { OnChangeDebouncePlugin } from "../plugins/OnChangeDebouncePlugin";
import DefaultTheme from "../themes/DefaultTheme";

function onError(error: Error) {
  console.error(error);
}

export function Editor() {
  const saveNote = useSaveNote();
  const { data: activeNote } = useActiveNote();
  const feedType = useAppState((state) => state.feedType);

  const UPDATED_TRANSFORMERS = [...TRANSFORMERS];

  if (!activeNote) {
    return null;
  }

  function onBlur(event: FocusEvent, editor: LexicalEditor) {
    saveNote.mutate({
      note: activeNote,
      editor,
      transformers: UPDATED_TRANSFORMERS,
    });
  }

  function onChange(editorState: EditorState) {
    saveNote.mutate({
      note: activeNote,
      editor: editorState,
      transformers: UPDATED_TRANSFORMERS,
      shouldInvalidate: true,
    });
  }

  function getInitalContent() {
    $convertFromMarkdownString(
      activeNote?.Content ?? "",
      UPDATED_TRANSFORMERS,
      undefined,
      false,
    );
    $setSelection(null);
  }

  const initialConfig: InitialConfigType = {
    namespace: "CometEditor",
    editorState: () => getInitalContent(),
    nodes: [
      HorizontalRuleNode,
      QuoteNode,
      HeadingNode,
      CodeNode,
      ListNode,
      ListItemNode,
      LinkNode,
      AutoLinkNode,
      HashtagNode,
      // ImageNode,
      // BannerNode,
    ],

    onError,
    theme: DefaultTheme,
    editable: feedType === "trash" ? false : true,
  };

  return (
    <div className="h-full">
      <LexicalComposer key={activeNote?.ID} initialConfig={initialConfig}>
        <RichTextPlugin
          contentEditable={
            <ContentEditable className="h-full cursor-text select-text flex-col overflow-y-auto px-16 pb-80 caret-sky-500/90 focus-visible:outline-none" />
          }
          ErrorBoundary={LexicalErrorBoundary}
        />

        {!activeNote.TrashedAt && (
          <>
            <OnChangeDebouncePlugin onChange={onChange} debounceTime={500} />
            <OnBlurPlugin onBlur={onBlur} />
          </>
        )}
        <MarkdownShortcutPlugin transformers={UPDATED_TRANSFORMERS} />
        <HistoryPlugin />
        <CustomHashtagPlugin />
      </LexicalComposer>
    </div>
  );
}
