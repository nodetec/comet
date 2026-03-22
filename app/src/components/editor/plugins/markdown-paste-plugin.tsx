import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createCodeNode, $isCodeNode } from "@lexical/code";
import { $isListItemNode, $isListNode } from "@lexical/list";
import {
  PASTE_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $getRoot,
  $isElementNode,
  $isDecoratorNode,
  $isParagraphNode,
  $isTextNode,
  $isLineBreakNode,
  type LexicalNode,
} from "lexical";
import { $isHeadingNode } from "@lexical/rich-text";
import { $findMatchingParent } from "@lexical/utils";
import { $generateNodesFromDOM } from "@lexical/html";
import { markdownToDOM } from "../lib/marked-import";
import { parseSingleChecklistItemContent } from "../lib/checklist-paste";
import {
  normalizeImportedCodeBlocksFromMarkdown,
  normalizeImportedNodes,
} from "../lib/markdown";

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

function parseSingleFencedCodeBlock(
  markdown: string,
): { language?: string; code: string } | null {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");

  let start = 0;
  while (start < lines.length && lines[start]?.trim() === "") {
    start++;
  }

  let end = lines.length - 1;
  while (end >= start && lines[end]?.trim() === "") {
    end--;
  }

  if (start > end) {
    return null;
  }

  const openingLine = lines[start]?.trimStart() ?? "";
  const openingMatch = /^(`{3,}|~{3,})(.*)$/.exec(openingLine);
  if (!openingMatch || /^(`{3,})[^`]+\1$/.test(openingLine)) {
    return null;
  }

  const fence = openingMatch[1];
  const fenceChar = fence[0];
  const fenceLen = fence.length;
  const escapedFenceChar = fenceChar === "`" ? "\\`" : "~";
  const closingFenceRe = new RegExp(
    String.raw`^[ \t]*${escapedFenceChar}{${fenceLen},}[ \t]*$`,
  );

  if (!closingFenceRe.test(lines[end] ?? "")) {
    return null;
  }

  const info = openingMatch[2].trim();
  const language = info.length > 0 ? info.split(/\s+/, 1)[0] : undefined;
  const code = lines.slice(start + 1, end).join("\n");

  return { language, code };
}

function isSelectionInsideChecklistItem(
  selection: ReturnType<typeof $getSelection>,
): boolean {
  if (!$isRangeSelection(selection)) {
    return false;
  }

  const listItemNode = $findMatchingParent(
    selection.anchor.getNode(),
    $isListItemNode,
  );
  if (!listItemNode) {
    return false;
  }

  const parentList = listItemNode.getParent();
  return $isListNode(parentList) && parentList.getListType() === "check";
}

function insertBlockNodes(nodes: LexicalNode[]): void {
  if (nodes.length === 0) return;

  const selection = $getSelection();

  if (!$isRangeSelection(selection)) {
    const root = $getRoot();
    for (const node of nodes) {
      root.append(node);
    }
    return;
  }

  if (!selection.isCollapsed()) {
    selection.removeText();
  }

  const anchorNode = selection.anchor.getNode();
  const targetBlock = anchorNode.getTopLevelElementOrThrow();
  const isEmptyBlock = isReplaceableEmptyBlockNode(targetBlock);

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

  const lastNode = nodes.at(-1);
  if ($isElementNode(lastNode)) {
    lastNode.selectEnd();
  }
}

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

function isEmptyParagraphNode(node: LexicalNode): boolean {
  if (!$isParagraphNode(node)) return false;

  const children = node.getChildren();
  if (children.length === 0) return true;

  return children.every((child) => {
    if ($isLineBreakNode(child)) return true;
    if ($isTextNode(child)) {
      return child.getTextContent().trim() === "";
    }
    return false;
  });
}

function isReplaceableEmptyBlockNode(node: LexicalNode): boolean {
  if (!$isParagraphNode(node) && !$isHeadingNode(node)) {
    return false;
  }

  if (node.getTextContent().trim() !== "") {
    return false;
  }

  const children = node.getChildren();
  if (children.length === 0) return true;

  return children.every((child) => {
    if ($isLineBreakNode(child)) return true;
    if ($isTextNode(child)) {
      return child.getTextContent().trim() === "";
    }
    return false;
  });
}

function trimBoundaryEmptyParagraphs(
  nodes: LexicalNode[],
  sourceMarkdown: string,
): LexicalNode[] {
  if (nodes.length === 0) return nodes;

  const lines = sourceMarkdown.split("\n");
  const hasLeadingBlankLine = lines.length > 0 && lines[0]?.trim().length === 0;
  const hasTrailingBlankLine =
    lines.length > 0 && lines.at(-1)?.trim().length === 0;

  let start = 0;
  let end = nodes.length;

  if (!hasLeadingBlankLine) {
    while (start < end && isEmptyParagraphNode(nodes[start])) {
      start++;
    }
  }

  if (!hasTrailingBlankLine) {
    while (end > start && isEmptyParagraphNode(nodes[end - 1])) {
      end--;
    }
  }

  return start === 0 && end === nodes.length ? nodes : nodes.slice(start, end);
}

export default function MarkdownPastePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent | InputEvent | KeyboardEvent) => {
        if (!(event instanceof ClipboardEvent)) {
          return false;
        }

        const clipboardData = event.clipboardData;
        if (!clipboardData) {
          return false;
        }

        const text = clipboardData.getData("text/plain");
        const lexicalJson = clipboardData.getData(
          "application/x-lexical-editor",
        );

        if (!text) {
          return false;
        }

        const markdownCandidate = !isLikelyJSON(text) && isLikelyMarkdown(text);

        // Prefer markdown-looking plain text even if Lexical JSON is present.
        // This matters when copying source markdown from another Lexical-based
        // app/editor that also adds application/x-lexical-editor.
        if (lexicalJson && !markdownCandidate) {
          return false;
        }

        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const parentCodeNode = $findMatchingParent(
            selection.anchor.getNode(),
            $isCodeNode,
          );
          if (parentCodeNode) {
            return false;
          }
        }

        // Skip if it looks like JSON
        if (isLikelyJSON(text)) {
          return false;
        }

        // Only handle if it looks like markdown
        if (!markdownCandidate) {
          return false;
        }

        const checklistContent = isSelectionInsideChecklistItem(selection)
          ? parseSingleChecklistItemContent(text)
          : null;

        event.preventDefault();

        if (checklistContent !== null) {
          editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) {
              return;
            }

            selection.insertText(checklistContent);
          });
          return true;
        }

        const singleFencedCodeBlock = parseSingleFencedCodeBlock(text);

        editor.update(() => {
          if (singleFencedCodeBlock) {
            const codeNode = $createCodeNode(singleFencedCodeBlock.language);
            if (singleFencedCodeBlock.code.length > 0) {
              codeNode.append($createTextNode(singleFencedCodeBlock.code));
            }
            insertBlockNodes([codeNode]);
            return;
          }

          const dom = markdownToDOM(text, { paste: true });
          const allNodes = normalizeImportedNodes(
            $generateNodesFromDOM(editor, dom),
          );
          normalizeImportedCodeBlocksFromMarkdown(allNodes, text);
          // Filter to block-level nodes only — $generateNodesFromDOM may
          // produce stray TextNodes from whitespace between HTML tags
          const filteredNodes = allNodes.filter(
            (node) => $isElementNode(node) || $isDecoratorNode(node),
          );
          const nodes = trimBoundaryEmptyParagraphs(filteredNodes, text);
          insertBlockNodes(nodes);
        });

        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor]);

  return null;
}
