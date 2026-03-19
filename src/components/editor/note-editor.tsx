import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { defineExtension } from "lexical";
import { RichTextExtension } from "@lexical/rich-text";
import { HistoryExtension } from "@lexical/history";
import { CheckListExtension, ListExtension } from "@lexical/list";
import { configExtension } from "lexical";
import {
  HorizontalRuleExtension,
  TabIndentationExtension,
} from "@lexical/extension";
import { CodeExtension } from "@lexical/code";
import { HashtagExtension } from "./extensions/hashtag-extension";
import { TableExtension } from "@lexical/table";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { ImageNode } from "./nodes/image-node";
import { YouTubeNode } from "./nodes/youtube-node";

import { searchWordsFromQuery } from "@/lib/search";

import theme from "./theme";
import { TRANSFORMERS } from "./transformers";
import InitialContentPlugin from "./plugins/initial-content-plugin";
import OnChangeMarkdownPlugin from "./plugins/on-change-markdown-plugin";
import CodeHighlightPlugin from "./plugins/code-highlight-plugin";
import ScrollCenterCurrentLinePlugin from "./plugins/scroll-center-current-line-plugin";
import ListBackspacePlugin from "./plugins/list-backspace-plugin";
import BlockBreakoutPlugin from "./plugins/block-breakout-plugin";
import HeadingAnchorPlugin from "./plugins/heading-anchor-plugin";
import HeadingBackspacePlugin from "./plugins/heading-backspace-plugin";
import LinkClickPlugin from "./plugins/link-click-plugin";
import LinkPastePlugin from "./plugins/link-paste-plugin";
import AutoLinkPlugin from "./plugins/autolink-plugin";
import MarkdownCopyPlugin from "./plugins/markdown-copy-plugin";
import MarkdownPastePlugin from "./plugins/markdown-paste-plugin";
import ImageDropPlugin from "./plugins/image-drop-plugin";
import SearchHighlightPlugin from "./plugins/search-highlight-plugin";
import ToolbarPlugin from "./plugins/toolbar-plugin";
import YouTubeEmbedPlugin from "./plugins/youtube-embed-plugin";
import TableActionMenuPlugin from "./plugins/table-action-menu-plugin";
import DevtoolsPlugin from "./plugins/devtools-plugin";

import TableClickOutsidePlugin from "./plugins/table-click-outside-plugin";
import TodoShortcutPlugin from "./plugins/todo-shortcut-plugin";

type NoteEditorProps = {
  devtoolsContainer: HTMLElement | null;
  focusMode: "none" | "immediate" | "pointerup";
  html: string | null;
  isNew: boolean;
  markdown: string;
  readOnly: boolean;
  searchQuery: string;
  toolbarContainer: HTMLElement | null;
  onChange(markdown: string): void;
  onFocusHandled(): void;
};

export type NoteEditorHandle = {
  focus(): void;
};

function EditorInner({
  devtoolsContainer,
  focusMode,
  html,
  isNew,
  markdown,
  readOnly,
  searchQuery,
  toolbarContainer,
  onChange,
  onFocusHandled,
  editorRef,
}: NoteEditorProps & {
  editorRef: React.RefObject<NoteEditorHandle | null>;
}) {
  const [editor] = useLexicalComposerContext();
  const [initComplete, setInitComplete] = useState(false);
  const handleInitComplete = useCallback(() => setInitComplete(true), []);
  const searchWords = useMemo(
    () => searchWordsFromQuery(searchQuery),
    [searchQuery],
  );

  useEffect(() => {
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  useImperativeHandle(
    editorRef,
    () => ({
      focus() {
        if (readOnly) return;
        editor.focus();
      },
    }),
    [editor, readOnly],
  );

  useEffect(() => {
    if (readOnly || focusMode === "none") return;

    if (focusMode === "pointerup") {
      const handlePointerUp = () => {
        editor.focus();
        onFocusHandled();
      };
      window.addEventListener("pointerup", handlePointerUp, { once: true });
      return () => {
        window.removeEventListener("pointerup", handlePointerUp);
      };
    }

    editor.focus();
    onFocusHandled();
  }, [editor, focusMode, onFocusHandled, readOnly]);

  return (
    <>
      <ContentEditable
        className="comet-editor-content"
        autoCapitalize="off"
        autoCorrect="off"
      />
      <OnChangeMarkdownPlugin initComplete={initComplete} onChange={onChange} />
      <InitialContentPlugin
        html={html}
        isNew={isNew}
        markdown={markdown}
        onInitComplete={handleInitComplete}
      />
      <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
      <CodeHighlightPlugin />
      <ScrollCenterCurrentLinePlugin />
      <ListBackspacePlugin />
      <BlockBreakoutPlugin />
      <HeadingAnchorPlugin />
      <HeadingBackspacePlugin />
      <LinkClickPlugin />
      <LinkPastePlugin />
      <AutoLinkPlugin />
      <MarkdownCopyPlugin />
      <MarkdownPastePlugin />
      <YouTubeEmbedPlugin />
      <ImageDropPlugin />
      <SearchHighlightPlugin searchWords={searchWords} />
      <TableActionMenuPlugin />

      <TableClickOutsidePlugin />
      <TodoShortcutPlugin />
      <DevtoolsPlugin portalContainer={devtoolsContainer} />
      {!readOnly && <ToolbarPlugin portalContainer={toolbarContainer} />}
    </>
  );
}

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(
  function NoteEditor(props, ref) {
    const editorExtension = useMemo(
      () =>
        defineExtension({
          name: "CometEditor",
          namespace: "CometEditor",
          theme,
          nodes: [AutoLinkNode, LinkNode, ImageNode, YouTubeNode],
          onError: (error: Error) => console.error("Lexical error:", error),
          dependencies: [
            RichTextExtension,
            HistoryExtension,
            ListExtension,
            configExtension(CheckListExtension, {
              disableTakeFocusOnClick: true,
            }),
            HorizontalRuleExtension,
            TabIndentationExtension,
            TableExtension,
            CodeExtension,
            HashtagExtension,
          ],
        }),
      [],
    );

    return (
      <LexicalExtensionComposer
        extension={editorExtension}
        contentEditable={null}
      >
        <div className="comet-editor-shell relative flex min-h-full w-full flex-1 flex-col">
          <EditorInner
            {...props}
            editorRef={ref as React.RefObject<NoteEditorHandle | null>}
          />
        </div>
      </LexicalExtensionComposer>
    );
  },
);
