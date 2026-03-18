import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  PASTE_COMMAND,
  COMMAND_PRIORITY_LOW,
  $getSelection,
  $isRangeSelection,
  $getRoot,
  $isElementNode,
  $isDecoratorNode,
} from "lexical";
import { $generateNodesFromDOM } from "@lexical/html";
import { markdownToDOM } from "../lib/marked-import";

// Patterns that strongly indicate markdown content
const MARKDOWN_PATTERNS = [
  /^#{1,6}\s+\S/m, // Headings: # Heading
  /\*\*[^*]+\*\*/, // Bold: **text**
  /(?<!\*)\*[^*]+\*(?!\*)/, // Italic: *text* (not preceded/followed by *)
  /~~[^~]+~~/, // Strikethrough: ~~text~~
  /`[^`]+`/, // Inline code: `code`
  /^```/m, // Code block start
  /^\s*[-*+]\s+\S/m, // Unordered list: - item or * item
  /^\s*\d+\.\s+\S/m, // Ordered list: 1. item
  /\[([^\]]+)\]\(([^)]+)\)/, // Links: [text](url)
  /!\[([^\]]*)\]\(([^)]+)\)/, // Images: ![alt](url)
  /^\s*>\s+\S/m, // Blockquote: > text
  /^\s*---\s*$/m, // Horizontal rule
  /^\s*\*\*\*\s*$/m, // Horizontal rule (asterisks)
  /\|.+\|.+\|/, // Table row: | cell | cell |
];

// Patterns that indicate it's probably NOT markdown (just plain text)
const PLAIN_TEXT_INDICATORS = [
  /^https?:\/\/[^\s]+$/, // Single URL
];

// Check if content looks like JSON or JSONC (JSON with comments)
function isLikelyJSON(text: string): boolean {
  const trimmed = text.trim();
  // Check if it starts with [ or { and ends with ] or }
  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  ) {
    // Try to parse as-is first
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      // Try stripping comments (JSONC support)
      const withoutComments = trimmed
        .replace(/\/\/.*$/gm, "") // Remove single-line comments
        .replace(/\/\*[\s\S]*?\*\//g, ""); // Remove multi-line comments
      try {
        JSON.parse(withoutComments);
        return true;
      } catch {
        // Still not valid JSON, but if it has JSON-like structure, skip markdown
        // Check for typical JSON patterns: "key": value
        if (/"[^"]+"\s*:\s*/.test(trimmed)) {
          return true;
        }
        return false;
      }
    }
  }
  return false;
}

function isLikelyMarkdown(text: string): boolean {
  // If it's a single-line that matches plain text indicators, skip
  const trimmed = text.trim();
  if (!trimmed.includes("\n")) {
    for (const pattern of PLAIN_TEXT_INDICATORS) {
      if (pattern.test(trimmed)) {
        return false;
      }
    }
  }

  // Check if any markdown patterns match
  for (const pattern of MARKDOWN_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}

export default function MarkdownPastePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        const text = clipboardData.getData("text/plain");
        if (!text) return false;

        // If Lexical JSON is on the clipboard, let the built-in handler use it
        if (clipboardData.getData("application/x-lexical-editor")) {
          return false;
        }

        // Skip if it looks like JSON
        if (isLikelyJSON(text)) return false;

        // Only handle if it looks like markdown
        if (!isLikelyMarkdown(text)) return false;

        event.preventDefault();

        const dom = markdownToDOM(text, { paste: true });

        editor.update(() => {
          const allNodes = $generateNodesFromDOM(editor, dom);
          // Filter to block-level nodes only — $generateNodesFromDOM may
          // produce stray TextNodes from whitespace between HTML tags
          const nodes = allNodes.filter(
            (n) => $isElementNode(n) || $isDecoratorNode(n),
          );
          if (nodes.length === 0) return;

          const selection = $getSelection();

          if (!$isRangeSelection(selection)) {
            const root = $getRoot();
            for (const node of nodes) {
              root.append(node);
            }
            return;
          }

          // Delete selected content first
          if (!selection.isCollapsed()) {
            selection.removeText();
          }

          // Find the block element containing the cursor
          const anchorNode = selection.anchor.getNode();
          const targetBlock = anchorNode.getTopLevelElementOrThrow();

          // If cursor is at the start of an empty paragraph, replace it
          const isEmptyBlock =
            $isElementNode(targetBlock) &&
            targetBlock.getTextContentSize() === 0;

          if (isEmptyBlock) {
            targetBlock.replace(nodes[0]);
            for (let i = 1; i < nodes.length; i++) {
              nodes[i - 1].insertAfter(nodes[i]);
            }
          } else {
            for (let i = 0; i < nodes.length; i++) {
              const after = i === 0 ? targetBlock : nodes[i - 1];
              after.insertAfter(nodes[i]);
            }
          }

          // Place cursor at end of last inserted node
          const lastNode = nodes[nodes.length - 1];
          if ($isElementNode(lastNode)) {
            lastNode.selectEnd();
          }
        });

        return true;
      },
      COMMAND_PRIORITY_LOW, // Lower priority so URL plugins run first
    );
  }, [editor]);

  return null;
}
