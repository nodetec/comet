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
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useActiveNote } from "~/hooks/useActiveNote";
import { useAppState } from "~/store";
import { $setSelection, type EditorState, type LexicalEditor } from "lexical";

import { useSaveNote } from "../hooks/useSaveNote";
import AutoLinkPlugin from "../lexical/autolink/AutoLinkPlugin";
import { MarkdownCodeBlockShortcutPlugin } from "../lexical/codeblock/MarkdownCodeBlockShortcutPlugin";
import { CustomHashtagPlugin } from "../lexical/customHashtag/CustomHashtagPlugin";
import { ImageNode } from "../lexical/markdownImage/ImageNode";
import ImagePastePlugin from "../lexical/markdownImage/ImagePastePlugin";
import IMAGE_TRANSFORMER from "../lexical/markdownImage/ImageTransformer";
import { OnChangeDebouncePlugin } from "../lexical/onChangeDebounce/OnChangeDebouncePlugin";
import { OnFocusPlugin } from "../lexical/onFocus/OnFocus";
import { ScrollCenterCurrentLinePlugin } from "../lexical/scrollCenterCurrentLine/ScrollCenterCurrentLinePlugin";
import TabKeyPlugin from "../lexical/tabKey/TabKeyPlugin";
import { ToolbarPlugin } from "../lexical/toolbar/ToolbarPlugin";
import { TweetNode } from "../lexical/tweet/TwitterNode";
import { TWITTER_TRANSFORMER } from "../lexical/tweet/TwitterTransformer";
import { YouTubeNode } from "../lexical/youtube/YouTubeNode";
import { YOUTUBE_TRANSFORMER } from "../lexical/youtube/YouTubeTransformer";
import DefaultTheme from "../themes/DefaultTheme";

function onError(error: Error) {
  console.error(error);
}

export function Editor() {
  const saveNote = useSaveNote();
  const { data: activeNote } = useActiveNote();
  const feedType = useAppState((state) => state.feedType);

  const setAppFocus = useAppState((state) => state.setAppFocus);

  const COMBINED_TRANSFORMERS = [
    IMAGE_TRANSFORMER,
    TWITTER_TRANSFORMER,
    YOUTUBE_TRANSFORMER,
    ...TRANSFORMERS,
  ];

  if (!activeNote) {
    return null;
  }

  // function onBlur(_event: FocusEvent, editor: LexicalEditor) {
  //   $setSelection(null);
  //   saveNote.mutate({
  //     note: activeNote,
  //     editor,
  //     transformers: COMBINED_TRANSFORMERS,
  //   });
  // }

  function onChange(editorState: EditorState) {
    saveNote.mutate({
      note: activeNote,
      editor: editorState,
      transformers: COMBINED_TRANSFORMERS,
      shouldInvalidate: true,
    });
  }

  function onFocus(_event: FocusEvent, _editor: LexicalEditor) {
    console.log("ContentEditable focused");
    setAppFocus({ panel: "editor", isFocused: true });
  }

  // function handleClick(event: React.MouseEvent<HTMLDivElement>) {
  //   event.preventDefault();
  //   if (feedType === "trash") {
  //     setAppFocus({ panel: "editor", isFocused: true });
  //   }
  // }

  function getInitalContent() {
    $convertFromMarkdownString(
      activeNote?.Content ?? "",
      COMBINED_TRANSFORMERS,
      undefined,
      true,
    );
    $setSelection(null);
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
      ImageNode,
      LinkNode,
      AutoLinkNode,
      HashtagNode,
      CodeNode,
      CodeHighlightNode,
      TweetNode,
      YouTubeNode,
    ],

    onError,
    theme: DefaultTheme,
    editable: feedType === "trash" ? false : true,
  };

  return (
    <LexicalComposer key={activeNote?.ID} initialConfig={initialConfig}>
      <div className="flex w-full justify-center border-b bg-background py-2">
        <ToolbarPlugin />
      </div>
      <RichTextPlugin
        contentEditable={
          <ScrollArea className="flex flex-1 flex-col" type="scroll">
            <ContentEditable className="mx-16 min-h-screen flex-auto select-text flex-col pb-[50%] pt-8 caret-sky-500/90 focus-visible:outline-none" />
          </ScrollArea>
        }
        ErrorBoundary={LexicalErrorBoundary}
      />

      {!activeNote.TrashedAt && (
        <>
          <OnChangeDebouncePlugin onChange={onChange} debounceTime={500} />
          {/* <OnBlurPlugin onBlur={onBlur} /> */}
          <OnFocusPlugin onFocus={onFocus} />
        </>
      )}
      <MarkdownShortcutPlugin transformers={COMBINED_TRANSFORMERS} />
      <ImagePastePlugin />
      <TabKeyPlugin tabSize={2} useSpaces={true} />
      <ListPlugin />
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
