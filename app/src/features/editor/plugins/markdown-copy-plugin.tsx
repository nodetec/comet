import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  COPY_COMMAND,
  CUT_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  $getSelection,
  $isRangeSelection,
  $getRoot,
  createEditor,
  ParagraphNode,
  TextNode,
} from "lexical";
import {
  $generateJSONFromSelectedNodes,
  $generateNodesFromSerializedNodes,
} from "@lexical/clipboard";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListNode, ListItemNode } from "@lexical/list";
import { CodeNode, CodeHighlightNode } from "@lexical/code";
import { CometHorizontalRuleNode } from "../nodes/comet-horizontal-rule-node";
import { ListAnchorNode } from "../nodes/list-anchor-node";
import { TableNode, TableRowNode, TableCellNode } from "@lexical/table";
import { LinkNode } from "@lexical/link";
import { HashtagNode } from "../nodes/hashtag-node";
import { ImageNode } from "../nodes/image-node";
import { YouTubeNode } from "../nodes/youtube-node";
import { CLIPBOARD_TRANSFORMERS } from "../transformers";
import { shouldCopyChecklistSelectionAsPlainText } from "../lib/checklist-clipboard";
import { $exportMarkdownForClipboard } from "../lib/markdown";

const HEADLESS_NODES = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  CodeNode,
  CodeHighlightNode,
  CometHorizontalRuleNode,
  ListAnchorNode,
  TableNode,
  TableRowNode,
  TableCellNode,
  LinkNode,
  HashtagNode,
  ImageNode,
  YouTubeNode,
  ParagraphNode,
  TextNode,
];

function $selectionToMarkdown(
  editor: ReturnType<typeof useLexicalComposerContext>[0],
): string {
  const selection = $getSelection();
  if (!selection) return "";
  if ($isRangeSelection(selection) && selection.isCollapsed()) return "";

  const { nodes } = $generateJSONFromSelectedNodes(editor, selection);
  if (nodes.length === 0) return "";

  const headless = createEditor({
    namespace: "MarkdownCopy",
    nodes: HEADLESS_NODES,
    onError: () => {},
  });

  headless.update(
    () => {
      const root = $getRoot();
      root.clear();
      // $generateNodesFromSerializedNodes properly trims nodes
      // to the selection boundaries (unlike $parseSerializedNode)
      const generated = $generateNodesFromSerializedNodes(nodes);
      root.append(...generated);
    },
    { discrete: true },
  );

  let markdown = "";
  headless.getEditorState().read(() => {
    markdown = $exportMarkdownForClipboard(CLIPBOARD_TRANSFORMERS);
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
      if (!selection) return false;
      if ($isRangeSelection(selection) && selection.isCollapsed()) return false;

      event.preventDefault();

      const markdown = shouldCopyChecklistSelectionAsPlainText(selection)
        ? selection.getTextContent()
        : $selectionToMarkdown(editor);
      clipboardData.setData(
        "text/plain",
        markdown || selection.getTextContent(),
      );

      // Preserve Lexical JSON for paste within the editor
      const { nodes } = $generateJSONFromSelectedNodes(editor, selection);
      if (nodes.length > 0) {
        clipboardData.setData(
          "application/x-lexical-editor",
          JSON.stringify({ nodes }),
        );
      }

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
