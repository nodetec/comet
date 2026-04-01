import { $isHeadingNode } from "@lexical/rich-text";
import {
  $isDecoratorNode,
  $isElementNode,
  $isLineBreakNode,
  $isParagraphNode,
  $isTextNode,
  type LexicalNode,
} from "lexical";

export type FencedCodeBlock = {
  code: string;
  language?: string;
};

export function parseSingleFencedCodeBlock(
  markdown: string,
): FencedCodeBlock | null {
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
  // eslint-disable-next-line sonarjs/slow-regex -- bounded to a single line
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

export function isBlockLevelNode(node: LexicalNode): boolean {
  return $isElementNode(node) || $isDecoratorNode(node);
}

export function isEmptyParagraphNode(node: LexicalNode): boolean {
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

export function isReplaceableEmptyBlockNode(node: LexicalNode): boolean {
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

export function trimBoundaryEmptyParagraphs(
  nodes: LexicalNode[],
  sourceMarkdown: string,
): LexicalNode[] {
  if (nodes.length === 0) return nodes;

  const lines = sourceMarkdown.split("\n");
  const hasLeadingBlankLine = lines.length > 0 && lines[0]?.trim().length === 0;
  const [lastLine] = lines.slice(-1);
  const hasTrailingBlankLine =
    lines.length > 0 && lastLine?.trim().length === 0;

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
