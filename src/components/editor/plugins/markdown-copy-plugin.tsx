import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  COPY_COMMAND,
  CUT_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  $getSelection,
  $isRangeSelection,
  $parseSerializedNode,
  $getRoot,
  createEditor,
  ParagraphNode,
  TextNode,
} from "lexical";
import {
  $generateJSONFromSelectedNodes,
  $getLexicalContent,
} from "@lexical/clipboard";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListNode, ListItemNode } from "@lexical/list";
import { CodeNode, CodeHighlightNode } from "@lexical/code";
import { HorizontalRuleNode } from "@lexical/extension";
import { TableNode, TableRowNode, TableCellNode } from "@lexical/table";
import { LinkNode } from "@lexical/link";
import { HashtagNode } from "@lexical/hashtag";
import { ImageNode } from "../nodes/image-node";
import { YouTubeNode } from "../nodes/youtube-node";
import { TRANSFORMERS } from "../transformers";
import { $exportMarkdownForClipboard } from "../lib/markdown";

function createHeadlessEditor() {
  return createEditor({
    namespace: "MarkdownCopy",
    nodes: [
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      CodeNode,
      CodeHighlightNode,
      HorizontalRuleNode,
      TableNode,
      TableRowNode,
      TableCellNode,
      LinkNode,
      HashtagNode,
      ImageNode,
      YouTubeNode,
      ParagraphNode,
      TextNode,
    ],
    onError: (error) => console.error("Markdown copy error:", error),
  });
}

function $getMarkdownContent(editor: ReturnType<typeof useLexicalComposerContext>[0]): string {
  const selection = $getSelection();
  if (!selection || ($isRangeSelection(selection) && selection.isCollapsed())) {
    return "";
  }

  const { nodes } = $generateJSONFromSelectedNodes(editor, selection);
  if (nodes.length === 0) return "";

  const headless = createHeadlessEditor();
  headless.update(
    () => {
      const root = $getRoot();
      root.clear();
      for (const json of nodes) {
        root.append($parseSerializedNode(json));
      }
    },
    { discrete: true },
  );

  let markdown = "";
  headless.getEditorState().read(() => {
    markdown = $exportMarkdownForClipboard(TRANSFORMERS);
  });
  return markdown;
}

export default function MarkdownCopyPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handleCopy = (event: ClipboardEvent) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return false;

      const selection = $getSelection();
      if (!selection || ($isRangeSelection(selection) && selection.isCollapsed())) {
        return false;
      }

      event.preventDefault();

      const markdown = $getMarkdownContent(editor);
      const lexicalJson = $getLexicalContent(editor, selection);

      clipboardData.setData("text/plain", markdown);
      if (lexicalJson) clipboardData.setData("application/x-lexical-editor", lexicalJson);

      return true;
    };

    const removeCopy = editor.registerCommand(
      COPY_COMMAND,
      (event) => {
        if (!(event instanceof ClipboardEvent)) return false;
        return handleCopy(event);
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    const removeCut = editor.registerCommand(
      CUT_COMMAND,
      (event) => {
        if (!(event instanceof ClipboardEvent)) return false;
        const handled = handleCopy(event);
        if (handled) {
          // Remove selected content after copying
          editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              selection.removeText();
            }
          });
        }
        return handled;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    return () => {
      removeCopy();
      removeCut();
    };
  }, [editor]);

  return null;
}
