import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown";
import type { Transformer } from "@lexical/markdown";
import type { ElementNode, LexicalNode } from "lexical";
import { $getRoot, $isParagraphNode, $isTextNode } from "lexical";

// Patterns matching block-level markdown structures that should NOT be merged
// with adjacent lines (mirrors Lexical's internal normalizeMarkdown logic).
const CODE_FENCE_RE = /^(`{3,}|~{3,})/;
const CODE_SINGLE_LINE_RE = /^```[^`]+```$/;
const HEADING_RE = /^#{1,6}\s/;
const QUOTE_RE = /^\s*>/;
const ORDERED_LIST_RE = /^\s*\d+\.\s/;
const UNORDERED_LIST_RE = /^\s*[-*+]\s/;
const CHECK_LIST_RE = /^\s*\[[ x]\]\s/i;
const TABLE_ROW_RE = /^\|/;
const TABLE_DIVIDER_RE = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const HTML_TAG_START_RE = /^<(\w+)/;
const HTML_TAG_END_RE = /^<\/(\w+)\s*>/;

/**
 * Merges soft-wrapped adjacent content lines into single lines, matching
 * Lexical's normalizeMarkdown(input, true) behavior. Block-level structures
 * (headings, lists, quotes, code fences, tables, HTML tags) are never merged.
 */
function normalizeMarkdown(input: string): string {
  const lines = input.split("\n");
  const result: string[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    const lastLine = result[result.length - 1];

    // Single-line code block (```code```) — don't toggle fence state
    if (CODE_SINGLE_LINE_RE.test(line)) {
      result.push(line);
      continue;
    }

    // Code fence open/close
    if (CODE_FENCE_RE.test(line.trimStart())) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }

    // Inside code block — preserve as-is
    if (inCodeBlock) {
      result.push(line);
      continue;
    }

    // Determine if this line should start a new block (not merge with previous)
    const isBlockBoundary =
      line === "" ||
      lastLine === "" ||
      lastLine === undefined ||
      HEADING_RE.test(lastLine) ||
      HEADING_RE.test(line) ||
      QUOTE_RE.test(line) ||
      ORDERED_LIST_RE.test(line) ||
      UNORDERED_LIST_RE.test(line) ||
      CHECK_LIST_RE.test(line) ||
      TABLE_ROW_RE.test(line) ||
      TABLE_DIVIDER_RE.test(line) ||
      HTML_TAG_START_RE.test(line) ||
      HTML_TAG_END_RE.test(line) ||
      HTML_TAG_END_RE.test(lastLine) ||
      HTML_TAG_START_RE.test(lastLine) ||
      CODE_FENCE_RE.test(lastLine);

    if (isBlockBoundary) {
      result.push(line);
    } else {
      // Merge soft-wrapped continuation line
      result[result.length - 1] = lastLine + " " + line.trimStart();
    }
  }

  return result.join("\n");
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
 * Pre-processes markdown for import: for blank-line groups *between* content
 * blocks, removes the first blank (the standard block separator) and keeps the
 * rest as empty paragraphs. Leading/trailing blank groups are preserved in full
 * since they aren't separators. Skips content inside code fences.
 */
function preprocessForImport(markdown: string): string {
  const lines = markdown.split("\n");
  const result: string[] = [];
  let inCodeFence = false;
  let hasContentBefore = false;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Track code fence state
    if (CODE_FENCE_RE.test(line.trimStart()) && !CODE_SINGLE_LINE_RE.test(line)) {
      inCodeFence = !inCodeFence;
      hasContentBefore = true;
      result.push(line);
      i++;
      continue;
    }

    // Inside code fences, preserve everything as-is
    if (inCodeFence) {
      result.push(line);
      i++;
      continue;
    }

    // Check if this is the start of a group of blank lines
    if (line.trim() === "") {
      // Count consecutive blank lines
      let blankCount = 0;
      while (i < lines.length && lines[i].trim() === "") {
        blankCount++;
        i++;
      }
      // Only remove the first blank (block separator) when the group sits
      // between two content blocks. Leading/trailing groups keep all blanks.
      const hasContentAfter = i < lines.length;
      const skip = hasContentBefore && hasContentAfter ? 1 : 0;
      for (let j = skip; j < blankCount; j++) {
        result.push("");
      }
    } else {
      hasContentBefore = true;
      result.push(line);
      i++;
    }
  }

  return result.join("\n");
}

/**
 * Imports markdown into the Lexical editor, preserving empty paragraphs.
 *
 * Normalizes soft-wrapped lines, then pre-processes blank-line groups so that
 * `shouldPreserveNewLines=true` creates the correct number of empty paragraph
 * nodes.
 */
export function $importMarkdown(
  markdown: string,
  transformers: Array<Transformer>,
  node?: ElementNode,
  options?: { preserveBlankLines?: boolean },
): void {
  // 1. Normalize: merge soft-wrapped adjacent content lines
  const normalized = normalizeMarkdown(markdown);
  // 2. Pre-process: convert blank-line groups for shouldPreserveNewLines mode.
  //    When preserveBlankLines is true (e.g. paste), skip preprocessing so
  //    every blank line becomes an empty paragraph.
  const processed = options?.preserveBlankLines
    ? normalized
    : preprocessForImport(normalized);
  // 3. Import with shouldPreserveNewLines=true
  $convertFromMarkdownString(processed, transformers, node, true);
}

/**
 * Exports the Lexical editor state to markdown, preserving empty paragraphs.
 *
 * Convention: each empty paragraph between blocks adds an extra `\n` beyond
 * the standard `\n\n` block separator.
 */
export function $exportMarkdown(transformers: Array<Transformer>): string {
  const root = $getRoot();
  const children = root.getChildren();

  // Scan for empty paragraphs and record their positions
  type Segment = "content" | "empty";
  const segments: Segment[] = [];
  for (const child of children) {
    segments.push(isEmptyParagraph(child) ? "empty" : "content");
  }

  // Fast path: no empty paragraphs, use standard export
  if (!segments.includes("empty")) {
    return $convertToMarkdownString(transformers, undefined, false);
  }

  // Standard export (loses empties, but gives correct markdown for content blocks)
  const exported = $convertToMarkdownString(transformers, undefined, false);

  // Split exported markdown into blocks, respecting code fences
  const exportedBlocks: string[] = [];
  const exportedLines = exported.split("\n");
  let currentBlock: string[] = [];
  let fenced = false;

  for (let i = 0; i < exportedLines.length; i++) {
    const line = exportedLines[i];

    if (CODE_FENCE_RE.test(line.trimStart()) && !CODE_SINGLE_LINE_RE.test(line)) {
      fenced = !fenced;
    }

    if (!fenced && line.trim() === "" && currentBlock.length > 0) {
      // Consume all consecutive blank lines (they form one separator)
      while (i + 1 < exportedLines.length && exportedLines[i + 1].trim() === "") {
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

  // Walk segments: group consecutive empties between content blocks
  const contentCount = segments.filter((s) => s === "content").length;
  let leading = 0;
  const between: number[] = [];
  let trailing = 0;
  let seenContent = false;
  let currentGap = 0;

  for (const seg of segments) {
    if (seg === "empty") {
      currentGap++;
    } else {
      if (!seenContent) {
        leading = currentGap;
      } else {
        between.push(currentGap);
      }
      currentGap = 0;
      seenContent = true;
    }
  }
  trailing = currentGap;

  // Guard: if block count doesn't match content count, the split assumption
  // broke — fall back to standard export (empties lost, but content correct)
  if (exportedBlocks.length !== contentCount) {
    return exported;
  }

  // Assemble result
  let result = "";

  // Leading empties
  for (let i = 0; i < leading; i++) {
    result += "\n";
  }

  for (let i = 0; i < exportedBlocks.length; i++) {
    if (i > 0) {
      // Standard separator
      result += "\n\n";
      // Extra newlines for empty paragraphs between these blocks
      const emptyCount = between[i - 1] || 0;
      for (let j = 0; j < emptyCount; j++) {
        result += "\n";
      }
    }
    result += exportedBlocks[i];
  }

  // Trailing empties: when there are no content blocks, the empty string
  // itself already represents one empty paragraph on reimport, so emit
  // one fewer newline to avoid an off-by-one.
  const trailingCount =
    exportedBlocks.length === 0 ? Math.max(0, trailing - 1) : trailing;
  for (let i = 0; i < trailingCount; i++) {
    result += "\n";
  }

  return result;
}

/**
 * Exports markdown for the clipboard. Uses `\n` between adjacent content
 * blocks (matching the editor's visual line spacing) and `\n` per empty
 * paragraph (visible blank line). This differs from $exportMarkdown which
 * uses `\n\n` separators for storage roundtrip fidelity.
 */
export function $exportMarkdownForClipboard(
  transformers: Array<Transformer>,
): string {
  const root = $getRoot();
  const children = root.getChildren();

  // Standard export gives correct markdown for all content blocks
  const exported = $convertToMarkdownString(transformers, undefined, false);

  // Fast path: no empty paragraphs, just replace \n\n separators with \n
  const hasEmpties = children.some((child) => isEmptyParagraph(child));
  if (!hasEmpties) {
    return replaceBlockSeparators(exported);
  }

  // Split exported markdown into blocks (same logic as $exportMarkdown)
  const exportedBlocks: string[] = [];
  const exportedLines = exported.split("\n");
  let currentBlock: string[] = [];
  let fenced = false;

  for (let i = 0; i < exportedLines.length; i++) {
    const line = exportedLines[i];

    if (
      CODE_FENCE_RE.test(line.trimStart()) &&
      !CODE_SINGLE_LINE_RE.test(line)
    ) {
      fenced = !fenced;
    }

    if (!fenced && line.trim() === "" && currentBlock.length > 0) {
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

  // Walk AST to compute gap structure
  const contentCount = children.filter(
    (child) => !isEmptyParagraph(child),
  ).length;
  let leading = 0;
  const between: number[] = [];
  let trailing = 0;
  let seenContent = false;
  let currentGap = 0;

  for (const child of children) {
    if (isEmptyParagraph(child)) {
      currentGap++;
    } else {
      if (!seenContent) {
        leading = currentGap;
      } else {
        between.push(currentGap);
      }
      currentGap = 0;
      seenContent = true;
    }
  }
  trailing = currentGap;

  if (exportedBlocks.length !== contentCount) {
    return replaceBlockSeparators(exported);
  }

  let result = "";

  for (let i = 0; i < leading; i++) {
    result += "\n";
  }

  for (let i = 0; i < exportedBlocks.length; i++) {
    if (i > 0) {
      // \n for the line break between blocks
      result += "\n";
      // Extra \n per empty paragraph in this gap
      const emptyCount = between[i - 1] || 0;
      for (let j = 0; j < emptyCount; j++) {
        result += "\n";
      }
    }
    result += exportedBlocks[i];
  }

  for (let i = 0; i < trailing; i++) {
    result += "\n";
  }

  return result;
}

/**
 * Replaces \n\n block separators with \n outside of code fences.
 */
function replaceBlockSeparators(markdown: string): string {
  const lines = markdown.split("\n");
  const result: string[] = [];
  let fenced = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (
      CODE_FENCE_RE.test(line.trimStart()) &&
      !CODE_SINGLE_LINE_RE.test(line)
    ) {
      fenced = !fenced;
    }

    // Skip blank separator lines outside code fences
    if (!fenced && line.trim() === "" && result.length > 0) {
      // Consume extra consecutive blank lines
      while (i + 1 < lines.length && lines[i + 1].trim() === "") {
        i++;
      }
      continue;
    }

    result.push(line);
  }

  return result.join("\n");
}
