import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
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
import { TabIndentationExtension } from "@lexical/extension";
import { CometHorizontalRuleNode } from "./nodes/comet-horizontal-rule-node";
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
import BlockBreakoutPlugin from "./plugins/block-breakout-plugin";
import HeadingAnchorPlugin from "./plugins/heading-anchor-plugin";
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
import HorizontalRuleCursorPlugin from "./plugins/horizontal-rule-cursor-plugin";
import DevtoolsPlugin from "./plugins/devtools-plugin";

import TableClickOutsidePlugin from "./plugins/table-click-outside-plugin";
import TodoShortcutPlugin from "./plugins/todo-shortcut-plugin";
import TagCompletionPlugin from "./plugins/tag-completion-plugin";
import { useShellStore } from "@/stores/use-shell-store";

type NoteEditorProps = {
  devtoolsContainer: HTMLElement | null;
  focusMode: "none" | "immediate" | "pointerup";
  html: string | null;
  isNew: boolean;
  loadKey: string;
  markdown: string;
  onEditorFocusChange?(focused: boolean): void;
  onSearchMatchCountChange?(count: number): void;
  readOnly: boolean;
  searchHighlightAllMatchesYellow?: boolean;
  searchActiveMatchIndex?: number | null;
  searchQuery: string;
  searchScrollRevision?: number;
  toolbarContainer: HTMLElement | null;
  onChange(markdown: string): void;
  onFocusHandled(): void;
};

export type NoteEditorHandle = {
  blur(): void;
  focus(): void;
};

function EditorInner({
  devtoolsContainer,
  focusMode,
  html,
  isNew,
  loadKey,
  markdown,
  readOnly,
  searchHighlightAllMatchesYellow,
  searchActiveMatchIndex,
  searchQuery,
  searchScrollRevision,
  toolbarContainer,
  onChange,
  onEditorFocusChange,
  onSearchMatchCountChange,
  onFocusHandled,
  editorRef,
}: NoteEditorProps & {
  editorRef: React.RefObject<NoteEditorHandle | null>;
}) {
  const [editor] = useLexicalComposerContext();
  const [initVersion, setInitVersion] = useState(0);
  const handleInitComplete = useCallback(
    () => setInitVersion((version) => version + 1),
    [],
  );
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
      blur() {
        editor.blur();
      },
      focus() {
        if (readOnly) return;
        editor.focus();
      },
    }),
    [editor, readOnly],
  );

  // Blur the editor when another pane gains focus
  const prevPaneRef = useRef(useShellStore.getState().focusedPane);
  useEffect(() => {
    return useShellStore.subscribe((state) => {
      const prev = prevPaneRef.current;
      prevPaneRef.current = state.focusedPane;
      if (prev === "editor" && state.focusedPane !== "editor") {
        editor.blur();
      }
    });
  }, [editor]);

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

  useEffect(() => {
    const handleFocusIn = () => {
      onEditorFocusChange?.(true);
    };

    const handleFocusOut = (event: FocusEvent) => {
      const root = editor.getRootElement();
      const nextTarget = event.relatedTarget;

      if (root && nextTarget instanceof Node && root.contains(nextTarget)) {
        return;
      }

      onEditorFocusChange?.(false);
    };

    return editor.registerRootListener((root, prevRoot) => {
      if (prevRoot) {
        prevRoot.removeEventListener("focusin", handleFocusIn);
        prevRoot.removeEventListener("focusout", handleFocusOut);
      }

      if (!root) {
        onEditorFocusChange?.(false);
        return;
      }

      root.addEventListener("focusin", handleFocusIn);
      root.addEventListener("focusout", handleFocusOut);
      onEditorFocusChange?.(root.contains(document.activeElement));
    });
  }, [editor, onEditorFocusChange]);

  return (
    <>
      <div className="comet-editor-content-wrap relative">
        <ContentEditable
          className="comet-editor-content"
          autoCapitalize="off"
          autoCorrect="off"
        />
      </div>
      <OnChangeMarkdownPlugin
        initVersion={initVersion}
        loadKey={loadKey}
        onChange={onChange}
      />
      <InitialContentPlugin
        html={html}
        isNew={isNew}
        loadKey={loadKey}
        markdown={markdown}
        onInitComplete={handleInitComplete}
      />
      <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
      <CodeHighlightPlugin />
      <ScrollCenterCurrentLinePlugin />
      <BlockBreakoutPlugin />
      <HeadingAnchorPlugin />
      <LinkClickPlugin />
      <LinkPastePlugin />
      <AutoLinkPlugin />
      <MarkdownCopyPlugin />
      <MarkdownPastePlugin />
      <YouTubeEmbedPlugin />
      <ImageDropPlugin />
      <SearchHighlightPlugin
        activeMatchIndex={searchActiveMatchIndex}
        highlightAllMatchesYellow={searchHighlightAllMatchesYellow}
        loadKey={loadKey}
        onMatchCountChange={onSearchMatchCountChange}
        scrollRevision={searchScrollRevision}
        searchWords={searchWords}
      />
      <TableActionMenuPlugin loadKey={loadKey} />

      <HorizontalRuleCursorPlugin />
      <TableClickOutsidePlugin />
      <TodoShortcutPlugin />
      <TagCompletionPlugin loadKey={loadKey} />
      <DevtoolsPlugin portalContainer={devtoolsContainer} />
      {!readOnly && (
        <ToolbarPlugin loadKey={loadKey} portalContainer={toolbarContainer} />
      )}
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
          nodes: [
            AutoLinkNode,
            LinkNode,
            ImageNode,
            YouTubeNode,
            CometHorizontalRuleNode,
          ],
          onError: (error: Error) => console.error("Lexical error:", error),
          dependencies: [
            RichTextExtension,
            HistoryExtension,
            ListExtension,
            configExtension(CheckListExtension, {
              disableTakeFocusOnClick: true,
            }),

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
