import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { HashtagNode } from "@lexical/hashtag";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { $convertFromMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import { ClickableLinkPlugin } from "@lexical/react/LexicalClickableLinkPlugin";
import {
  LexicalComposer,
  type InitialConfigType,
} from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ScrollArea } from "~/components/ui/scroll-area-old";
import { useAppState } from "~/store";
import { $setSelection, type EditorState, type LexicalEditor } from "lexical";

import { useNote } from "../hooks/useNote";
import { useSaveNote } from "../hooks/useSaveNote";
import AutoLinkPlugin from "../lexical/autolink/AutoLinkPlugin";
import { MarkdownCodeBlockShortcutPlugin } from "../lexical/codeblock/MarkdownCodeBlockShortcutPlugin";
import { CustomHashtagPlugin } from "../lexical/customHashtag/CustomHashtagPlugin";
import { MarkdownImageShortcutPlugin } from "../lexical/markdownImage/MarkdownImageShortcut";
import { MarkdownImageNode } from "../lexical/markdownImage/nodes/MarkdownImageNode";
import { MARKDOWN_IMAGE_TRANSFORMER } from "../lexical/markdownImage/transformers/MarkdownImageTransformer";
import { OnChangeDebouncePlugin } from "../lexical/onChangeDebounce/OnChangeDebouncePlugin";
import { OnFocusPlugin } from "../lexical/onFocus/OnFocus";
import { ScrollCenterCurrentLinePlugin } from "../lexical/scrollCenterCurrentLine/ScrollCenterCurrentLinePlugin";
import TabFocusPlugin from "../lexical/tabFocus";
import { ToolbarPlugin } from "../lexical/toolbar/ToolbarPlugin";
import { YouTubeNode } from "../lexical/youtube/YouTubeNode";
import { YOUTUBE_TRANSFORMER } from "../lexical/youtube/YouTubeTransformer";
import DefaultTheme from "../themes/DefaultTheme";
import { DummyEditor } from "./DummyEditor";
import { EditorClickWrapper } from "./EditorClickWrapper";

function onError(error: Error) {
  console.error(error);
}

export function Editor() {
  const feedType = useAppState((state) => state.feedType);
  const setAppFocus = useAppState((state) => state.setAppFocus);
  const activeNoteId = useAppState((state) => state.activeNoteId);
  const note = useNote(activeNoteId);

  const saveNote = useSaveNote();

  const COMBINED_TRANSFORMERS = [
    MARKDOWN_IMAGE_TRANSFORMER,
    YOUTUBE_TRANSFORMER,
    ...TRANSFORMERS,
  ];

  if (note.isLoading) {
    return <DummyEditor />;
  }

  if (!note.data || !activeNoteId) {
    // TODO: show some nice art or something here
    return null;
  }

  function onChange(editorState: EditorState) {
    console.log(editorState.toJSON());
    saveNote.mutate({
      note: note.data,
      editor: editorState,
      transformers: COMBINED_TRANSFORMERS,
      shouldInvalidate: true,
    });
  }

  function onFocus(_event: FocusEvent, _editor: LexicalEditor) {
    console.log("ContentEditable focused");
    setAppFocus({ panel: "editor", isFocused: true });
  }

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    if (feedType === "trash") {
      event.preventDefault();
      setAppFocus({ panel: "editor", isFocused: true });
    }
  }

  function getInitalContent() {
    $convertFromMarkdownString(
      note.data?.content === "" ? "# " : (note.data?.content ?? ""),
      COMBINED_TRANSFORMERS,
      undefined,
      true,
    );
    if (note.data?.content !== "") {
      $setSelection(null);
    }
  }

  const initialConfig: InitialConfigType = {
    namespace: "CometEditor",
    editorState: () => getInitalContent(),
    nodes: [
      HeadingNode,
      ListNode,
      ListItemNode,
      CodeHighlightNode,
      CodeNode,
      HorizontalRuleNode,
      QuoteNode,
      MarkdownImageNode,
      LinkNode,
      AutoLinkNode,
      HashtagNode,
      CodeNode,
      CodeHighlightNode,
      YouTubeNode,
    ],

    onError,
    theme: DefaultTheme,
    editable: feedType === "trash" ? false : true,
  };

  return (
    <LexicalComposer key={activeNoteId} initialConfig={initialConfig}>
      <div className="bg-background draggable flex w-full justify-center border-b py-2">
        <ToolbarPlugin />
      </div>
      <RichTextPlugin
        contentEditable={
          <ScrollArea
            className="w-full"
            type="scroll"
            // Add an id to make it easier to identify
            id="editor-scroll-area"
          >
            <EditorClickWrapper>
              <div className="cursor-text">
                <ContentEditable
                  onClick={handleClick}
                  className="caret-primary mx-auto min-h-full max-w-[46rem] px-16 pt-8 pb-[50%] select-text focus-visible:outline-none xl:pb-[30%]"
                  // Add an id to make it easier to identify
                  id="editor-content-editable"
                />
              </div>
            </EditorClickWrapper>
          </ScrollArea>
        }
        ErrorBoundary={LexicalErrorBoundary}
      />

      {!note.data?.trashedAt && (
        <>
          <OnChangeDebouncePlugin onChange={onChange} debounceTime={500} />
          <OnFocusPlugin onFocus={onFocus} />
        </>
      )}
      <MarkdownImageShortcutPlugin />
      <MarkdownShortcutPlugin transformers={COMBINED_TRANSFORMERS} />
      <ListPlugin />
      <TabIndentationPlugin maxIndent={5} />
      <TabFocusPlugin />
      <HistoryPlugin />
      <CustomHashtagPlugin />
      <ScrollCenterCurrentLinePlugin />
      <LinkPlugin />
      <ClickableLinkPlugin />
      <AutoLinkPlugin />
      <MarkdownCodeBlockShortcutPlugin />
    </LexicalComposer>
  );
}
