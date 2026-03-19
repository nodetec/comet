import type { Transformer } from "@lexical/markdown";
import { $generateNodesFromDOM } from "@lexical/html";
import type { ElementNode, LexicalNode } from "lexical";
import {
  $createParagraphNode,
  $createTextNode,
  $getEditor,
  $getRoot,
  $isElementNode,
  $isParagraphNode,
  $isTextNode,
} from "lexical";
import { $isCodeNode } from "@lexical/code";
import { $isQuoteNode } from "@lexical/rich-text";
import { $convertToMarkdownStringNormalized } from "./markdown-export";

// Patterns matching block-level markdown structures that should NOT be merged
// with adjacent lines (mirrors Lexical's internal normalizeMarkdown logic).
const CODE_FENCE_RE = /^(`{3,}|~{3,})/;
const CODE_SINGLE_LINE_RE = /^(`{3,})[^`]+\1$/;

/**
 * Tracks code fence state properly: a closing fence must use the same
 * character and be at least as long as the opening fence (CommonMark spec).
 */
type FenceState = { char: string; length: number } | null;

const CLIPBOARD_EMAIL_LINK_RE =
  /\[([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\]\(mailto:\1\)/g;

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

function normalizeImportedQuoteSpacing(node: LexicalNode): void {
  if ($isElementNode(node)) {
    for (const child of node.getChildren()) {
      normalizeImportedQuoteSpacing(child);
    }
  }

  if (!$isQuoteNode(node)) {
    return;
  }

  let previousNonEmptyParagraph: LexicalNode | null = null;
  for (const child of [...node.getChildren()]) {
    if ($isParagraphNode(child)) {
      if (isEmptyParagraph(child)) {
        previousNonEmptyParagraph = null;
      } else {
        if (previousNonEmptyParagraph) {
          previousNonEmptyParagraph.insertAfter($createParagraphNode());
        }
        previousNonEmptyParagraph = child;
      }
      continue;
    }

    previousNonEmptyParagraph = null;
  }
}

type FencedCodeBlock = {
  signature: string;
  text: string;
};

function normalizeCodeBlockLanguage(
  language: string | null | undefined,
): string {
  return !language || language === "plain" ? "" : language;
}

function getCodeBlockSignature(
  language: string | null | undefined,
  text: string,
): string {
  return `${normalizeCodeBlockLanguage(language)}\u0000${text.replace(/\n+$/, "")}`;
}

function collectFencedCodeBlocks(markdown: string): FencedCodeBlock[] {
  const lines = markdown.split("\n");
  const blocks: FencedCodeBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    if (CODE_SINGLE_LINE_RE.test(trimmed)) {
      blocks.push({
        signature: getCodeBlockSignature("", ""),
        text: "",
      });
      continue;
    }

    const match = CODE_FENCE_RE.exec(trimmed);
    if (!match) {
      continue;
    }

    const fenceChar = match[1][0];
    const fenceLen = match[1].length;
    const escapedFenceChar = fenceChar === "`" ? "\\`" : "~";
    const closeFenceRe = new RegExp(
      `^[ \\t]*${escapedFenceChar}{${fenceLen},}[ \\t]*$`,
    );

    let end = i + 1;
    while (end < lines.length && !closeFenceRe.test(lines[end])) {
      end++;
    }

    const contentLines = lines.slice(i + 1, end);
    let trailingBlankLines = 0;
    for (let j = contentLines.length - 1; j >= 0; j--) {
      if (contentLines[j].trim() !== "") {
        break;
      }
      trailingBlankLines++;
    }

    const baseLines =
      trailingBlankLines > 0
        ? contentLines.slice(0, contentLines.length - trailingBlankLines)
        : contentLines;
    const text = baseLines.join("\n") + "\n".repeat(trailingBlankLines);
    const info = trimmed.slice(match[1].length).trim();
    const language =
      info.length > 0
        ? normalizeCodeBlockLanguage(info.split(/\s+/, 1)[0])
        : "";
    blocks.push({
      signature: getCodeBlockSignature(language, text),
      text,
    });
    i = end;
  }

  return blocks;
}

function normalizeImportedCodeBlockText(
  node: LexicalNode,
  codeBlocksBySignature: Map<string, string[]>,
): void {
  if ($isElementNode(node)) {
    for (const child of node.getChildren()) {
      normalizeImportedCodeBlockText(child, codeBlocksBySignature);
    }
  }

  if (!$isCodeNode(node)) {
    return;
  }

  const expectedText = codeBlocksBySignature
    .get(getCodeBlockSignature(node.getLanguage(), node.getTextContent()))
    ?.shift();
  if (expectedText == null) {
    return;
  }

  if (node.getTextContent() === expectedText) {
    return;
  }

  node.clear();
  if (expectedText.length > 0) {
    node.append($createTextNode(expectedText));
  }
}

function normalizeImportedCodeBlocksFromMarkdown(
  nodes: LexicalNode[],
  markdown: string,
): void {
  const codeBlocksBySignature = new Map<string, string[]>();
  for (const block of collectFencedCodeBlocks(markdown)) {
    const existing = codeBlocksBySignature.get(block.signature);
    if (existing) {
      existing.push(block.text);
    } else {
      codeBlocksBySignature.set(block.signature, [block.text]);
    }
  }

  for (const node of nodes) {
    normalizeImportedCodeBlockText(node, codeBlocksBySignature);
  }
}

export function normalizeImportedNodes(nodes: LexicalNode[]): LexicalNode[] {
  for (const node of nodes) {
    normalizeImportedQuoteSpacing(node);
  }

  return nodes;
}

/**
 * Imports pre-rendered HTML into the Lexical editor.
 * Used for note loading — HTML is provided by the Rust backend (comrak).
 */
const domParser = new DOMParser();

export function $importMarkdownFromHTML(
  html: string,
  markdown: string,
  node?: ElementNode,
): void {
  const t0 = performance.now();
  const editor = $getEditor();
  const dom = domParser.parseFromString(
    `<!DOCTYPE html><html><body>${html}</body></html>`,
    "text/html",
  );
  const t1 = performance.now();
  const nodes = normalizeImportedNodes($generateNodesFromDOM(editor, dom));
  normalizeImportedCodeBlocksFromMarkdown(nodes, markdown);
  const t2 = performance.now();
  const target = node ?? $getRoot();
  target.clear();
  target.append(...nodes);
  const t3 = performance.now();
  console.log(
    `[editor:importFromHTML] ${html.length} chars HTML → ` +
      `DOMParser: ${(t1 - t0).toFixed(1)}ms, ` +
      `$generateNodesFromDOM: ${(t2 - t1).toFixed(1)}ms, ` +
      `append: ${(t3 - t2).toFixed(1)}ms, ` +
      `total: ${(t3 - t0).toFixed(1)}ms`,
  );
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
  const exported = $convertToMarkdownStringNormalized(
    transformers,
    undefined,
    false,
  );

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
 * Exports markdown for the clipboard. The storage format uses extra newlines
 * for empty paragraphs (Bear/Obsidian behavior):
 *   \n\n = standard block separator
 *   \n\n\n = separator + 1 empty paragraph
 *   \n\n\n\n = separator + 2 empty paragraphs
 *
 * Standard markdown only needs \n\n between blocks. We reduce runs of 3+
 * newlines by 1 (collapsing the extra empty paragraphs), but preserve \n\n
 * separators and all newlines inside code fences.
 */
export function $exportMarkdownForClipboard(
  transformers: Array<Transformer>,
): string {
  const stored = $exportMarkdown(transformers);

  const lines = stored.split("\n");
  const result: string[] = [];
  let fence: FenceState = null;
  let blankRun = 0;

  const flushBlankRun = (insideFence: boolean) => {
    const output = insideFence
      ? blankRun
      : blankRun <= 1
        ? blankRun
        : blankRun - 1;
    for (let j = 0; j < output; j++) {
      result.push("");
    }
    blankRun = 0;
  };

  for (const line of lines) {
    if (line.trim() === "") {
      blankRun++;
      continue;
    }

    // The blank run belongs to the region before this line. Use the current
    // fence state, not the next one, so blanks before an opening fence are
    // normalized as regular block separators.
    flushBlankRun(fence !== null);
    result.push(line);
    fence = updateFenceState(line, fence);
  }

  flushBlankRun(fence !== null);

  return result.join("\n").replace(CLIPBOARD_EMAIL_LINK_RE, "$1");
}
