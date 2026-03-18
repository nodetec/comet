import { $convertToMarkdownString } from "@lexical/markdown";
import type { Transformer } from "@lexical/markdown";
import { $generateNodesFromDOM } from "@lexical/html";
import type { ElementNode, LexicalNode } from "lexical";
import { $getEditor, $getRoot, $isParagraphNode, $isTextNode } from "lexical";
import { markdownToDOM } from "./marked-import";

// Patterns matching block-level markdown structures that should NOT be merged
// with adjacent lines (mirrors Lexical's internal normalizeMarkdown logic).
const CODE_FENCE_RE = /^(`{3,}|~{3,})/;
const CODE_SINGLE_LINE_RE = /^(`{3,})[^`]+\1$/;

/**
 * Tracks code fence state properly: a closing fence must use the same
 * character and be at least as long as the opening fence (CommonMark spec).
 */
type FenceState = { char: string; length: number } | null;

function updateFenceState(line: string, current: FenceState): FenceState {
  const trimmed = line.trimStart();

  // Skip single-line fenced code (```code```)
  if (CODE_SINGLE_LINE_RE.test(line)) return current;

  const match = CODE_FENCE_RE.exec(trimmed);
  if (!match) return current;

  const fenceChar = match[1][0]; // '`' or '~'
  const fenceLen = match[1].length;

  if (current === null) {
    // Opening fence
    return { char: fenceChar, length: fenceLen };
  }

  // Closing fence: must match char and be >= length
  if (fenceChar === current.char && fenceLen >= current.length) {
    return null;
  }

  // Not a valid close — still inside the code block
  return current;
}

/**
 * Returns true if the node is an empty paragraph (no children, or a single
 * text node with only whitespace).
 */
function isEmptyParagraph(node: LexicalNode): boolean {
  if (!$isParagraphNode(node)) return false;
  const children = node.getChildren();
  if (children.length === 0) return true;
  if (children.length === 1 && $isTextNode(children[0])) {
    const text = children[0].getTextContent();
    return /^\s*$/.test(text);
  }
  return false;
}

/**
 * Imports markdown into the Lexical editor using marked.js for parsing.
 * Converts markdown → HTML (via marked) → Lexical nodes (via $generateNodesFromDOM).
 */
export function $importMarkdown(markdown: string, node?: ElementNode): void {
  const editor = $getEditor();
  const dom = markdownToDOM(markdown);
  const nodes = $generateNodesFromDOM(editor, dom);
  const target = node ?? $getRoot();
  target.clear();
  target.append(...nodes);
}

/**
 * Exports the Lexical editor state to markdown.
 *
 * Each empty paragraph in the AST becomes a blank line (`\n`). Content blocks
 * are separated by `\n` (no extra blank line — the empty paragraph nodes
 * provide the visual spacing, matching Bear/Obsidian behavior).
 */
export function $exportMarkdown(transformers: Array<Transformer>): string {
  const root = $getRoot();
  const children = root.getChildren();

  // Single pass: classify each child as empty or content, count content nodes.
  const isEmpty: boolean[] = [];
  let contentCount = 0;
  for (const child of children) {
    const empty = isEmptyParagraph(child);
    isEmpty.push(empty);
    if (!empty) contentCount++;
  }

  // Export content blocks via Lexical (loses empties, but gives correct
  // markdown for content blocks).
  const exported = $convertToMarkdownString(transformers, undefined, false);

  // Split Lexical's export into blocks (it uses \n\n between them),
  // respecting code fences.
  const exportedBlocks: string[] = [];
  const exportedLines = exported.split("\n");
  let currentBlock: string[] = [];
  let exportFence: FenceState = null;

  for (let i = 0; i < exportedLines.length; i++) {
    const line = exportedLines[i];
    exportFence = updateFenceState(line, exportFence);

    if (exportFence === null && line.trim() === "" && currentBlock.length > 0) {
      while (
        i + 1 < exportedLines.length &&
        exportedLines[i + 1].trim() === ""
      ) {
        i++;
      }
      exportedBlocks.push(currentBlock.join("\n"));
      currentBlock = [];
    } else {
      currentBlock.push(line);
    }
  }
  if (currentBlock.length > 0) {
    exportedBlocks.push(currentBlock.join("\n"));
  }

  if (exportedBlocks.length !== contentCount) {
    return exported;
  }

  // Assemble: content blocks are separated by \n\n (standard markdown).
  // Empty paragraphs add an extra \n per empty paragraph.
  // So [content, content] → "A\n\nB"
  //    [content, empty, content] → "A\n\n\nB"
  //    [content, empty, empty, content] → "A\n\n\n\nB"
  let result = "";
  let blockIdx = 0;

  for (let i = 0; i < children.length; i++) {
    if (isEmpty[i]) {
      // Each empty paragraph adds one \n beyond the standard separator
      result += "\n";
    } else {
      if (blockIdx > 0) {
        // Standard \n\n separator between content blocks
        result += "\n\n";
      }
      result += exportedBlocks[blockIdx];
      blockIdx++;
    }
  }

  return result;
}

/**
 * Exports markdown for the clipboard. Takes the storage export and
 * reduces all newline runs by 1, converting the internal storage
 * convention back to standard markdown:
 *   \n\n (separator) → \n (adjacent blocks)
 *   \n\n\n (separator + 1 empty) → \n\n (one blank line)
 *   \n\n\n\n (separator + 2 empties) → \n\n\n (two blank lines)
 */
export function $exportMarkdownForClipboard(
  transformers: Array<Transformer>,
): string {
  const stored = $exportMarkdown(transformers);
  return stored.replace(/\n{2,}/g, (match) => {
    return "\n".repeat(match.length - 1);
  });
}
