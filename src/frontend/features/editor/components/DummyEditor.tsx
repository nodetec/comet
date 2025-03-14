import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { HashtagNode } from "@lexical/hashtag";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import {
  LexicalComposer,
  type InitialConfigType,
} from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useAppState } from "~/store";

import { MarkdownImageNode } from "../lexical/markdownImage/nodes/MarkdownImageNode";
import { ToolbarPlugin } from "../lexical/toolbar/ToolbarPlugin";
import { YouTubeNode } from "../lexical/youtube/YouTubeNode";
import DefaultTheme from "../themes/DefaultTheme";

function onError(error: Error) {
  console.error(error);
}

export function DummyEditor() {
  const feedType = useAppState((state) => state.feedType);
  const activeNoteId = useAppState((state) => state.activeNoteId);

  const initialConfig: InitialConfigType = {
    namespace: "DummyEditor",
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
          <ScrollArea className="flex flex-1 flex-col" type="scroll">
            <ContentEditable className="min-h-full flex-auto flex-col px-16 pt-8 pb-[50%] caret-sky-500/90 select-text focus-visible:outline-none" />
          </ScrollArea>
        }
        ErrorBoundary={LexicalErrorBoundary}
      />
    </LexicalComposer>
  );
}
