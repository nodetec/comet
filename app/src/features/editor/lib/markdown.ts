import {
  $convertFromMarkdownString,
  type Transformer,
} from "@lexical/markdown";
import { $generateNodesFromDOM } from "@lexical/html";
import { $isListItemNode, $isListNode, type ListNode } from "@lexical/list";
import { $isCometHorizontalRuleNode } from "../nodes/comet-horizontal-rule-node";
import { TRANSFORMERS } from "../transformers";
import type { ElementNode, LexicalEditor, LexicalNode } from "lexical";
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
import { $isHeadingNode, $isQuoteNode } from "@lexical/rich-text";
import { $convertTopLevelElementToMarkdown } from "./markdown-export";

// Patterns matching block-level markdown structures that should NOT be merged
// with adjacent lines (mirrors Lexical's internal normalizeMarkdown logic).
const CODE_FENCE_RE = /^(`{3,}|~{3,})/;
const CODE_SINGLE_LINE_RE = /^(`{3,})[^`]+\1$/;
const EXPLICIT_BLANK_LINE_SENTINEL = "\uE000";

const CLIPBOARD_EMAIL_LINK_RE =
  /\[([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\]\(mailto:\1\)/g;

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

function isExplicitBlankLineParagraph(node: LexicalNode): boolean {
  if (!$isParagraphNode(node)) {
    return false;
  }

  const children = node.getChildren();
  return (
    children.length === 1 &&
    $isTextNode(children[0]) &&
    children[0].getTextContent() === EXPLICIT_BLANK_LINE_SENTINEL
  );
}

function normalizeImportedNestedBlankLineParagraphs(node: LexicalNode): void {
  if (!$isElementNode(node)) {
    return;
  }

  for (const child of node.getChildren()) {
    if ($isParagraphNode(child) && isExplicitBlankLineParagraph(child)) {
      child.clear();
      continue;
    }

    normalizeImportedNestedBlankLineParagraphs(child);

    if (isEmptyParagraph(child)) {
      child.remove();
    }
  }
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
  for (const child of node.getChildren()) {
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

function isIgnorableWrapperChild(node: LexicalNode): boolean {
  if ($isParagraphNode(node)) {
    return isEmptyParagraph(node);
  }

  if ($isTextNode(node)) {
    return /^\s*$/.test(node.getTextContent());
  }

  return false;
}

function isWrapperOnlyListItem(child: LexicalNode): boolean {
  if (!$isListItemNode(child)) return false;

  const children = child.getChildren();
  const hasNestedList = children.some((grandchild) => $isListNode(grandchild));
  if (!hasNestedList) return false;

  return children.every(
    (grandchild) =>
      $isListNode(grandchild) || isIgnorableWrapperChild(grandchild),
  );
}

function mergeNestedListIntoListItem(
  owner: LexicalNode,
  nestedList: ListNode,
): void {
  if (!$isListItemNode(owner)) {
    return;
  }

  const existingNestedList = owner
    .getChildren()
    .find(
      (child): child is ListNode =>
        $isListNode(child) && child.getListType() === nestedList.getListType(),
    );

  if (!existingNestedList) {
    owner.append(nestedList);
    return;
  }

  for (const nestedChild of nestedList.getChildren()) {
    existingNestedList.append(nestedChild);
  }

  nestedList.remove();
}

function normalizeImportedListNesting(node: LexicalNode): void {
  if ($isElementNode(node)) {
    for (const child of node.getChildren()) {
      normalizeImportedListNesting(child);
    }
  }

  if (!$isListNode(node)) {
    return;
  }

  let previousItem: LexicalNode | null = null;

  for (const child of node.getChildren()) {
    if (!$isListItemNode(child)) {
      previousItem = child;
      continue;
    }

    if (
      previousItem &&
      $isListItemNode(previousItem) &&
      isWrapperOnlyListItem(child)
    ) {
      const nestedLists = child
        .getChildren()
        .filter((grandchild): grandchild is ListNode =>
          $isListNode(grandchild),
        );

      for (const nestedList of nestedLists) {
        mergeNestedListIntoListItem(previousItem, nestedList);
      }

      child.remove();
      continue;
    }

    previousItem = child;
  }
}

function normalizeImportedListItemLeadParagraph(node: LexicalNode): void {
  if ($isElementNode(node)) {
    for (const child of node.getChildren()) {
      normalizeImportedListItemLeadParagraph(child);
    }
  }

  if (!$isListItemNode(node) || node.getChildrenSize() < 2) {
    return;
  }

  const firstChild = node.getFirstChild();
  if (!$isParagraphNode(firstChild)) {
    return;
  }

  for (const child of firstChild.getChildren()) {
    firstChild.insertBefore(child);
  }

  firstChild.remove();

  for (const child of node.getChildren()) {
    if (!$isParagraphNode(child) || !isEmptyParagraph(child)) {
      continue;
    }

    const previousSibling = child.getPreviousSibling();
    const nextSibling = child.getNextSibling();
    if (
      previousSibling == null ||
      nextSibling == null ||
      $isParagraphNode(nextSibling)
    ) {
      continue;
    }

    child.remove();
  }
}

type SourceCodeBlock = {
  style: SourceCodeBlockStyle;
  text: string;
};

type SourceCodeBlockStyle = "fenced" | "indented";

function normalizeCodeBlockLanguage(
  language: string | null | undefined,
): string {
  return !language || language === "plain" || language === "indented"
    ? ""
    : language;
}

function parseFencedCodeBlock(
  lines: string[],
  startIndex: number,
  fenceMatch: RegExpExecArray,
): { block: SourceCodeBlock; endIndex: number } {
  const fenceChar = fenceMatch[1][0];
  const fenceLen = fenceMatch[1].length;
  const escapedFenceChar = fenceChar === "`" ? "\\`" : "~";
  const closeFenceRe = new RegExp(
    String.raw`^[ \t]*${escapedFenceChar}{${fenceLen},}[ \t]*$`,
  );

  let end = startIndex + 1;
  while (end < lines.length && !closeFenceRe.test(lines[end])) {
    end++;
  }

  const contentLines = lines.slice(startIndex + 1, end);
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

  return {
    block: { style: "fenced", text },
    endIndex: end,
  };
}

function hasIndentedCodePrefix(line: string): boolean {
  return line.startsWith("\t") || line.startsWith("    ");
}

function stripIndentedCodePrefix(line: string): string {
  if (line.startsWith("\t")) {
    return line.slice(1);
  }

  if (line.startsWith("    ")) {
    return line.slice(4);
  }

  return line;
}

function isIndentedCodeStart(lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  if (!hasIndentedCodePrefix(line)) {
    return false;
  }

  const previousLine = index === 0 ? "" : (lines[index - 1] ?? "");
  if (previousLine.trim() !== "") {
    return false;
  }

  const stripped = stripIndentedCodePrefix(line).trimStart();
  return !/^([-*+]|\d+\.)\s+/.test(stripped) && !/^>\s+/.test(stripped);
}

function parseIndentedCodeBlock(
  lines: string[],
  startIndex: number,
): { block: SourceCodeBlock; endIndex: number } {
  const contentLines: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      contentLines.push("");
      index++;
      continue;
    }

    if (!hasIndentedCodePrefix(line)) {
      break;
    }

    contentLines.push(stripIndentedCodePrefix(line));
    index++;
  }

  while (contentLines.length > 0 && contentLines.at(-1) === "") {
    contentLines.pop();
  }

  return {
    block: {
      style: "indented",
      text: contentLines.join("\n"),
    },
    endIndex: Math.max(startIndex, index - 1),
  };
}

function collectSourceCodeBlocks(markdown: string): SourceCodeBlock[] {
  const lines = markdown.split("\n");
  const blocks: SourceCodeBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trimStart();

    if (CODE_SINGLE_LINE_RE.test(trimmed)) {
      blocks.push({ style: "fenced", text: "" });
      index++;
      continue;
    }

    const fencedMatch = CODE_FENCE_RE.exec(trimmed);
    if (fencedMatch) {
      const { block, endIndex } = parseFencedCodeBlock(
        lines,
        index,
        fencedMatch,
      );
      blocks.push(block);
      index = endIndex + 1;
      continue;
    }

    if (!isIndentedCodeStart(lines, index)) {
      index++;
      continue;
    }

    const { block, endIndex } = parseIndentedCodeBlock(lines, index);
    blocks.push(block);
    index = endIndex + 1;
  }

  return blocks;
}

function normalizeImportedCodeBlocksSequentially(
  node: LexicalNode,
  sourceBlocks: SourceCodeBlock[],
): void {
  if ($isElementNode(node)) {
    for (const child of node.getChildren()) {
      normalizeImportedCodeBlocksSequentially(child, sourceBlocks);
    }
  }

  if (!$isCodeNode(node)) {
    return;
  }

  const sourceBlock = sourceBlocks.shift();
  if (sourceBlock == null) {
    return;
  }

  if (node.getTextContent() !== sourceBlock.text) {
    node.clear();
    if (sourceBlock.text.length > 0) {
      node.append($createTextNode(sourceBlock.text));
    }
  }

  if (
    sourceBlock.style === "indented" &&
    normalizeCodeBlockLanguage(node.getLanguage()) === ""
  ) {
    node.setLanguage("indented");
  }
}

export function normalizeImportedCodeBlocksFromMarkdown(
  nodes: LexicalNode[],
  markdown: string,
): void {
  const sourceBlocks = collectSourceCodeBlocks(markdown);
  for (const node of nodes) {
    normalizeImportedCodeBlocksSequentially(node, sourceBlocks);
  }
}

export function normalizeImportedNodes(nodes: LexicalNode[]): LexicalNode[] {
  for (const node of nodes) {
    normalizeImportedNestedBlankLineParagraphs(node);
    normalizeImportedQuoteSpacing(node);
    normalizeImportedListNesting(node);
    normalizeImportedListItemLeadParagraph(node);
  }

  return nodes;
}

export function normalizeImportedTopLevelListSpacingMarkers(
  nodes: LexicalNode[],
): LexicalNode[] {
  const normalized: LexicalNode[] = [];
  let skipUntil = -1;

  for (const [index, node] of nodes.entries()) {
    if (index < skipUntil) {
      continue;
    }

    normalized.push(node);

    if (!$isListNode(node)) {
      continue;
    }

    let separatorEnd = index + 1;
    while (
      separatorEnd < nodes.length &&
      (isEmptyParagraph(nodes[separatorEnd]) ||
        isExplicitBlankLineParagraph(nodes[separatorEnd]))
    ) {
      separatorEnd++;
    }

    const nextNode = nodes[separatorEnd];
    if (separatorEnd === index + 1 || !$isListNode(nextNode)) {
      continue;
    }

    normalized.push(...nodes.slice(index + 2, separatorEnd));
    skipUntil = separatorEnd;
  }

  return normalized;
}

function countLineFeeds(text: string): number {
  return [...text].filter((char) => char === "\n").length;
}

function countLeadingSpaces(text: string): number {
  let count = 0;
  while (count < text.length && text[count] === " ") {
    count++;
  }
  return count;
}

function isBareBlankQuoteLine(line: string): boolean {
  return line.trim() === ">";
}

function checklistIndentForImport(line: string): number | null {
  const checklistMatch = /^(\s*)[-*+]\s+\[(?:[ xX])\](?:\s|$)/.exec(line);
  return checklistMatch ? (checklistMatch[1]?.length ?? 0) : null;
}

function isNestedListLine(line: string): boolean {
  return /^(\s*)(?:[-*+]|\d+\.)\s+/.test(line);
}

function normalizeNestedChecklistIndentation(
  lines: string[],
  startIndex: number,
  checklistIndent: number,
): void {
  for (
    let nestedIndex = startIndex + 1;
    nestedIndex < lines.length;
    nestedIndex++
  ) {
    const nestedLine = lines[nestedIndex] ?? "";

    if (nestedLine.trim() === "") {
      continue;
    }

    const nestedIndent = countLeadingSpaces(nestedLine);
    if (nestedIndent <= checklistIndent) {
      break;
    }

    if (nestedIndent >= checklistIndent + 4 || !isNestedListLine(nestedLine)) {
      continue;
    }

    lines[nestedIndex] =
      " ".repeat(checklistIndent + 4) + nestedLine.trimStart();
  }
}

function preprocessMarkdownForLexicalImport(markdown: string): string {
  const lines = markdown.split("\n");

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";

    if (isBareBlankQuoteLine(line)) {
      lines[index] = `${line} `;
      continue;
    }

    const checklistIndent = checklistIndentForImport(line);
    if (checklistIndent === null) {
      continue;
    }

    normalizeNestedChecklistIndentation(lines, index, checklistIndent);
  }

  return lines.join("\n");
}

function minimumSeparatorLineFeeds(
  previousNode: LexicalNode,
  nextNode: LexicalNode,
): number {
  return canUseSoftBreakSeparator(previousNode, nextNode) ? 1 : 2;
}

type ExplicitMarkerSpacingParts = {
  contentNodes: LexicalNode[];
  leadingMarkers: number;
  separatorMarkerCounts: number[];
  trailingMarkers: number;
};

function collectExplicitMarkerSpacingParts(
  nodes: LexicalNode[],
): ExplicitMarkerSpacingParts {
  const contentNodes: LexicalNode[] = [];
  const separatorMarkerCounts: number[] = [];
  let pendingMarkers = 0;
  let leadingMarkers = 0;
  let sawContent = false;

  for (const node of nodes) {
    if (isExplicitBlankLineParagraph(node)) {
      pendingMarkers++;
      continue;
    }

    if (isEmptyParagraph(node)) {
      continue;
    }

    if (sawContent) {
      separatorMarkerCounts.push(pendingMarkers);
    } else {
      leadingMarkers = pendingMarkers;
      sawContent = true;
    }

    pendingMarkers = 0;
    contentNodes.push(node);
  }

  return {
    contentNodes,
    leadingMarkers,
    separatorMarkerCounts,
    trailingMarkers: pendingMarkers,
  };
}

function appendEmptyParagraphs(target: LexicalNode[], count: number): void {
  for (let index = 0; index < count; index++) {
    target.push($createParagraphNode());
  }
}

function normalizeImportedTopLevelSpacingFromExplicitMarkers(
  nodes: LexicalNode[],
): LexicalNode[] {
  const {
    contentNodes,
    leadingMarkers,
    separatorMarkerCounts,
    trailingMarkers,
  } = collectExplicitMarkerSpacingParts(nodes);

  if (contentNodes.length === 0) {
    return Array.from({ length: leadingMarkers }, () => $createParagraphNode());
  }

  const rebuiltNodes: LexicalNode[] = [];
  appendEmptyParagraphs(rebuiltNodes, leadingMarkers);

  for (const [index, node] of contentNodes.entries()) {
    rebuiltNodes.push(node);

    const nextNode = contentNodes[index + 1];
    if (!nextNode) {
      continue;
    }

    const markerCount = separatorMarkerCounts[index] ?? 0;
    const visibleSpacerCount = Math.max(
      0,
      markerCount + 1 - minimumSeparatorLineFeeds(node, nextNode),
    );

    appendEmptyParagraphs(rebuiltNodes, visibleSpacerCount);
  }

  appendEmptyParagraphs(rebuiltNodes, trailingMarkers);

  return rebuiltNodes;
}

type TopLevelMarkdownMatch = {
  markdown: string;
  node: LexicalNode;
  start: number;
  end: number;
};

function matchTopLevelNodesToMarkdown(
  nodes: LexicalNode[],
  markdown: string,
): TopLevelMarkdownMatch[] | null {
  const matches: TopLevelMarkdownMatch[] = [];
  let cursor = 0;

  for (const node of nodes) {
    const blockMarkdown = $convertTopLevelElementToMarkdown(node, TRANSFORMERS);
    if (blockMarkdown == null) {
      return null;
    }

    const start = markdown.indexOf(blockMarkdown, cursor);
    if (start === -1) {
      return null;
    }

    const end = start + blockMarkdown.length;
    matches.push({ markdown: blockMarkdown, node, start, end });
    cursor = end;
  }

  return matches;
}

export function normalizeImportedTopLevelSpacingFromMarkdown(
  nodes: LexicalNode[],
  markdown: string,
): LexicalNode[] {
  const contentNodes = nodes.filter((node) => !isEmptyParagraph(node));
  if (contentNodes.length === 0) {
    return nodes;
  }

  const matches = matchTopLevelNodesToMarkdown(contentNodes, markdown);
  if (matches == null) {
    return nodes;
  }

  const rebuiltNodes: LexicalNode[] = [];
  const leadingLineFeeds = countLineFeeds(markdown.slice(0, matches[0].start));
  for (let index = 0; index < leadingLineFeeds; index++) {
    rebuiltNodes.push($createParagraphNode());
  }

  for (const [index, match] of matches.entries()) {
    rebuiltNodes.push(match.node);

    const nextMatch = matches[index + 1];
    if (nextMatch == null) {
      continue;
    }

    const separator = markdown.slice(match.end, nextMatch.start);
    const separatorLineFeeds = countLineFeeds(separator);
    const visibleSpacerCount = Math.max(
      0,
      separatorLineFeeds -
        minimumSeparatorLineFeeds(match.node, nextMatch.node),
    );

    for (let spacerIndex = 0; spacerIndex < visibleSpacerCount; spacerIndex++) {
      rebuiltNodes.push($createParagraphNode());
    }
  }

  const [lastMatch] = matches.slice(-1);
  if (lastMatch == null) {
    return rebuiltNodes;
  }

  const trailingLineFeeds = countLineFeeds(markdown.slice(lastMatch.end));
  const trailingSpacerCount = Math.max(0, trailingLineFeeds - 1);
  for (let spacerIndex = 0; spacerIndex < trailingSpacerCount; spacerIndex++) {
    rebuiltNodes.push($createParagraphNode());
  }

  return rebuiltNodes;
}

export function createNormalizedMarkdownNodesFromHTML(
  editor: LexicalEditor,
  html: string,
  markdown: string,
): LexicalNode[] {
  const normalizedHtml = html.replace(
    /<p><br\s*\/?><\/p>/g,
    `<p>${EXPLICIT_BLANK_LINE_SENTINEL}</p>`,
  );
  const dom = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body>${normalizedHtml}</body></html>`,
    "text/html",
  );

  let nodes = normalizeImportedNodes($generateNodesFromDOM(editor, dom));
  nodes = normalizeImportedTopLevelListSpacingMarkers(nodes);
  normalizeImportedCodeBlocksFromMarkdown(nodes, markdown);
  return normalizeImportedTopLevelSpacingFromExplicitMarkers(nodes);
}

/**
 * Imports pre-rendered HTML into the Lexical editor.
 * Used for note loading — HTML is provided by the Rust backend (comrak).
 */
export function $importMarkdownFromHTML(
  html: string,
  markdown: string,
  node?: ElementNode,
): void {
  const t0 = performance.now();
  const editor = $getEditor();
  const t1 = performance.now();
  const nodes = createNormalizedMarkdownNodesFromHTML(editor, html, markdown);
  const t2 = performance.now();
  const target = node ?? $getRoot();
  target.clear();
  target.append(...nodes);
  const t3 = performance.now();
  if (import.meta.env.DEV) {
    console.log(
      `[editor:importFromHTML] ${html.length} chars HTML → ` +
        `DOMParser: ${(t1 - t0).toFixed(1)}ms, ` +
        `$generateNodesFromDOM: ${(t2 - t1).toFixed(1)}ms, ` +
        `append: ${(t3 - t2).toFixed(1)}ms, ` +
        `total: ${(t3 - t0).toFixed(1)}ms`,
    );
  }
}

export function $importMarkdownToLexical(
  markdown: string,
  transformers: Array<Transformer>,
  node?: ElementNode,
): void {
  const normalizedMarkdown = preprocessMarkdownForLexicalImport(markdown);
  const target = node ?? $getRoot();
  target.clear();
  $convertFromMarkdownString(normalizedMarkdown, transformers, target);
  let normalized = normalizeImportedNodes(target.getChildren());
  normalized = normalizeImportedTopLevelListSpacingMarkers(normalized);
  normalizeImportedCodeBlocksFromMarkdown(normalized, normalizedMarkdown);
  normalized = normalizeImportedTopLevelSpacingFromMarkdown(
    normalized,
    normalizedMarkdown,
  );
  target.clear();
  target.append(...normalized);
}

/**
 * Exports the Lexical editor state to markdown.
 *
 * Empty paragraphs are now the visible representation of markdown blank lines.
 * Between content blocks:
 * - zero empty paragraphs still export as a standard markdown separator (`\n\n`)
 * - one empty paragraph also exports as `\n\n`
 * - additional empty paragraphs export as additional blank lines
 */
function isSoftBreakLeadNode(node: LexicalNode): boolean {
  return $isParagraphNode(node) || $isHeadingNode(node);
}

function isInterruptingTopLevelBlock(node: LexicalNode): boolean {
  return (
    isSoftBreakLeadNode(node) ||
    $isQuoteNode(node) ||
    $isCodeNode(node) ||
    $isListNode(node) ||
    $isCometHorizontalRuleNode(node)
  );
}

function canUseSoftBreakSeparator(
  previousNode: LexicalNode,
  nextNode: LexicalNode,
): boolean {
  return (
    (isSoftBreakLeadNode(previousNode) &&
      isInterruptingTopLevelBlock(nextNode)) ||
    ($isCometHorizontalRuleNode(previousNode) && isSoftBreakLeadNode(nextNode))
  );
}

function separatorBetweenTopLevelBlocks(
  previousNode: LexicalNode,
  nextNode: LexicalNode,
  pendingEmptyParagraphs: number,
): string {
  return "\n".repeat(
    minimumSeparatorLineFeeds(previousNode, nextNode) + pendingEmptyParagraphs,
  );
}

export function $exportMarkdown(transformers: Array<Transformer>): string {
  const root = $getRoot();
  const children = root.getChildren();
  let result = "";
  let pendingEmptyParagraphs = 0;
  let previousContentNode: LexicalNode | null = null;

  for (const child of children) {
    if (isEmptyParagraph(child)) {
      pendingEmptyParagraphs++;
      continue;
    }

    const blockMarkdown = $convertTopLevelElementToMarkdown(
      child,
      transformers,
    );
    if (blockMarkdown == null) {
      continue;
    }

    result +=
      previousContentNode === null
        ? "\n".repeat(pendingEmptyParagraphs)
        : separatorBetweenTopLevelBlocks(
            previousContentNode,
            child,
            pendingEmptyParagraphs,
          );

    result += blockMarkdown;
    previousContentNode = child;
    pendingEmptyParagraphs = 0;
  }

  if (previousContentNode !== null && pendingEmptyParagraphs > 0) {
    result += "\n".repeat(pendingEmptyParagraphs + 1);
  }

  return previousContentNode === null ? "" : result;
}

/**
 * Exports markdown for the clipboard. Clipboard markdown now matches the stored
 * markdown representation so copy/paste preserves the visible blank lines.
 */
export function $exportMarkdownForClipboard(
  transformers: Array<Transformer>,
): string {
  return $exportMarkdown(transformers).replace(CLIPBOARD_EMAIL_LINK_RE, "$1");
}
