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
import { ScrollArea } from "~/components/ui/scroll-area";
import { useActiveNote } from "~/hooks/useActiveNote";
import { useAppState } from "~/store";
import { $setSelection, type EditorState, type LexicalEditor } from "lexical";

import { useSaveNote } from "../hooks/useSaveNote";
import { CustomHashtagPlugin } from "../plugins/CustomHashtagPlugin";
import { OnBlurPlugin } from "../plugins/OnBlurPlugin";
import { OnChangeDebouncePlugin } from "../plugins/OnChangeDebouncePlugin";
import { OnFocusPlugin } from "../plugins/OnFocus";
import { ScrollCenterCurrentLinePlugin } from "../plugins/ScrollCenterCurrentLinePlugin";
import DefaultTheme from "../themes/DefaultTheme";

function onError(error: Error) {
  console.error(error);
}

export function Editor() {
  const saveNote = useSaveNote();
  const { data: activeNote } = useActiveNote();
  const feedType = useAppState((state) => state.feedType);

  const setAppFocus = useAppState((state) => state.setAppFocus);

  const UPDATED_TRANSFORMERS = [...TRANSFORMERS];

  if (!activeNote) {
    return null;
  }

  function onBlur(_event: FocusEvent, editor: LexicalEditor) {
    $setSelection(null);
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

  function onFocus(_event: FocusEvent, _editor: LexicalEditor) {
    console.log("ContentEditable focused");
    setAppFocus({ panel: "editor", isFocused: true });
  }

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    if (feedType === "trash") {
      setAppFocus({ panel: "editor", isFocused: true });
    }
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
    <LexicalComposer key={activeNote?.ID} initialConfig={initialConfig}>
      <RichTextPlugin
        contentEditable={
          <ScrollArea type="scroll">
            <ContentEditable
              onClick={handleClick}
              className="min-h-[calc(100vh-4rem)] flex-auto select-text flex-col px-16 pb-[50%] caret-sky-500/90 focus-visible:outline-none"
            />
          </ScrollArea>
        }
        ErrorBoundary={LexicalErrorBoundary}
      />

      {!activeNote.TrashedAt && (
        <>
          <OnChangeDebouncePlugin onChange={onChange} debounceTime={500} />
          <OnBlurPlugin onBlur={onBlur} />
          <OnFocusPlugin onFocus={onFocus} />
        </>
      )}
      <MarkdownShortcutPlugin transformers={UPDATED_TRANSFORMERS} />
      <HistoryPlugin />
      <CustomHashtagPlugin />
      <ScrollCenterCurrentLinePlugin />
    </LexicalComposer>
  );
}
