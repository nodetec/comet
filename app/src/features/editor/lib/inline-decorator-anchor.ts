import {
  $createTextNode,
  $isTextNode,
  type LexicalNode,
  type TextNode,
} from "lexical";

/**
 * Zero-width space used as the active cursor anchor beside inline decorators
 * like horizontal rules, images, and YouTube embeds.
 *
 * Checklist items do not use this marker for active editing state. They have a
 * separate checklist marker model and only treat `\u200B` as a
 * legacy placeholder when normalizing old content.
 */
export const INLINE_DECORATOR_ZWSP_ANCHOR = "\u200B";

/** Matches text nodes that contain only ZWSP cursor anchors (one or more). */
const INLINE_DECORATOR_ZWSP_ANCHOR_ONLY_RE = /^\u200B+$/;

export function isDecoratorCursorAnchorText(
  node: LexicalNode | null | undefined,
): node is TextNode {
  return (
    $isTextNode(node) &&
    INLINE_DECORATOR_ZWSP_ANCHOR_ONLY_RE.test(node.getTextContent())
  );
}

function needsDecoratorCursorAnchor(
  node: LexicalNode | null | undefined,
): boolean {
  return node == null || !$isTextNode(node);
}

export function ensureDecoratorCursorAnchors(node: LexicalNode): boolean {
  let changed = false;

  const previousSibling = node.getPreviousSibling();
  if (needsDecoratorCursorAnchor(previousSibling)) {
    node.insertBefore($createTextNode(INLINE_DECORATOR_ZWSP_ANCHOR));
    changed = true;
  }

  const nextSibling = node.getNextSibling();
  if (needsDecoratorCursorAnchor(nextSibling)) {
    node.insertAfter($createTextNode(INLINE_DECORATOR_ZWSP_ANCHOR));
    changed = true;
  }

  return changed;
}
