import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isRootNode,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  type LexicalNode,
  ParagraphNode,
  TextNode,
} from "lexical";
import {
  $createCometHorizontalRuleNode,
  $isCometHorizontalRuleNode,
  CometHorizontalRuleNode,
} from "../nodes/comet-horizontal-rule-node";
import { $isImageNode, ImageNode } from "../nodes/image-node";
import { $isYouTubeNode, YouTubeNode } from "../nodes/youtube-node";

/** Zero-width space used as cursor anchor beside the HR. */
const ZWSP = "\u200B";

/** Matches text nodes that contain only ZWSP cursor anchors (one or more). */
const ZWSP_ONLY_RE = /^\u200B+$/;

function isAnchorText(
  node: ReturnType<typeof import("lexical").$getNodeByKey>,
): boolean {
  return $isTextNode(node) && ZWSP_ONLY_RE.test(node.getTextContent());
}

function $cleanupOrphanedAnchors(children: LexicalNode[]): boolean {
  const hasDecorator = children.some(
    (c) =>
      $isCometHorizontalRuleNode(c) ||
      $isImageNode(c) ||
      $isYouTubeNode(c),
  );
  if (
    !hasDecorator &&
    children.length > 0 &&
    children.every((c) => isAnchorText(c))
  ) {
    for (const child of children) {
      child.remove();
    }
    return true;
  }
  return false;
}

function $collectSpillContent(
  children: LexicalNode[],
): { spillBefore: LexicalNode[]; spillAfter: LexicalNode[] } {
  const spillBefore: LexicalNode[] = [];
  const spillAfter: LexicalNode[] = [];
  let seenHR = false;

  for (const child of children) {
    if ($isCometHorizontalRuleNode(child)) {
      seenHR = true;
      continue;
    }
    if (isAnchorText(child)) continue;

    if ($isTextNode(child)) {
      const text = child.getTextContent().replace(/\u200B/g, "");
      if (text.length === 0) {
        child.remove();
        continue;
      }
      child.setTextContent(text);
    }

    if (seenHR) {
      spillAfter.push(child);
    } else {
      spillBefore.push(child);
    }
  }

  return { spillBefore, spillAfter };
}

function $normalizeHRParagraph(paragraphNode: ParagraphNode): void {
  const children = paragraphNode.getChildren();
  const hrIndex = children.findIndex($isCometHorizontalRuleNode);

  if (hrIndex === -1) {
    $cleanupOrphanedAnchors(children);
    return;
  }

  const isCorrect =
    children.length === 3 &&
    hrIndex === 1 &&
    isAnchorText(children[0]) &&
    isAnchorText(children[2]);
  if (isCorrect) return;

  const { spillBefore, spillAfter } = $collectSpillContent(children);

  if (spillAfter.length > 0) {
    const p = $createParagraphNode();
    for (const child of spillAfter) {
      p.append(child);
    }
    paragraphNode.insertAfter(p);
    p.selectEnd();
  }

  if (spillBefore.length > 0) {
    const p = $createParagraphNode();
    for (const child of spillBefore) {
      p.append(child);
    }
    paragraphNode.insertBefore(p);
  }
}

/**
 * Keeps the inline HR well-behaved inside paragraphs.
 *
 * - HR transform: wraps root-level HRs in a paragraph and ensures zero-width
 *   space TextNode anchors on both sides for cursor placement.
 * - Paragraph transform: keeps the HR isolated — any typed content next to
 *   the anchors is moved to a new paragraph.
 */
export default function HorizontalRuleCursorPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Ensure the HR always has zwsp cursor anchors on both sides.
    const removeHrTransform = editor.registerNodeTransform(
      CometHorizontalRuleNode,
      (node) => {
        const parent = node.getParent();

        // Wrap root-level HRs in a paragraph with anchors.
        if (parent && $isRootNode(parent)) {
          console.log("[HR] Wrapping root-level HR in paragraph with anchors");
          const p = $createParagraphNode();
          node.insertBefore(p);
          p.append($createTextNode(ZWSP));
          p.append(node);
          p.append($createTextNode(ZWSP));
          return;
        }

        // Ensure anchors exist on both sides.
        const prev = node.getPreviousSibling();
        if (!prev || !isAnchorText(prev)) {
          console.log("[HR] Adding left cursor anchor (zwsp TextNode)");
          node.insertBefore($createTextNode(ZWSP));
        }

        const next = node.getNextSibling();
        if (!next || !isAnchorText(next)) {
          console.log("[HR] Adding right cursor anchor (zwsp TextNode)");
          node.insertAfter($createTextNode(ZWSP));
        }
      },
    );

    // Ensure images have zwsp cursor anchors when at the edge of a paragraph.
    const removeImageTransform = editor.registerNodeTransform(
      ImageNode,
      (node) => {
        const prev = node.getPreviousSibling();
        if (!prev) {
          node.insertBefore($createTextNode(ZWSP));
        }

        const next = node.getNextSibling();
        if (!next) {
          node.insertAfter($createTextNode(ZWSP));
        }
      },
    );

    // Ensure YouTube embeds have zwsp cursor anchors at paragraph edges.
    const removeYouTubeTransform = editor.registerNodeTransform(
      YouTubeNode,
      (node) => {
        const prev = node.getPreviousSibling();
        if (!prev) {
          node.insertBefore($createTextNode(ZWSP));
        }

        const next = node.getNextSibling();
        if (!next) {
          node.insertAfter($createTextNode(ZWSP));
        }
      },
    );

    // Convert "---" to HR immediately on the third dash (no space needed).
    // Also matches em/en-dash variants from macOS auto-substitution:
    // "--" → "—" (em dash), then third "-" → "—-"
    const HR_PATTERN = /^(---|\u2014-?|\u2013-{1,2})$/;
    const removeTextTransform = editor.registerNodeTransform(
      TextNode,
      (textNode) => {
        if (!HR_PATTERN.test(textNode.getTextContent())) return;

        const parent = textNode.getParent();
        if (!parent || !$isParagraphNode(parent)) return;

        // Only convert if the paragraph has no other visible content
        // (ignore linebreaks, empty text, and zwsp anchors).
        const visibleText = parent
          .getTextContent()
          .replace(/[\u200B\n\r]/g, "")
          .trim();
        if (!HR_PATTERN.test(visibleText)) return;

        console.log("[HR] Converting --- to horizontal rule");
        const hr = $createCometHorizontalRuleNode();
        parent.clear();
        parent.append(hr);

        // Create a paragraph after for the cursor to land in.
        const p = $createParagraphNode();
        parent.insertAfter(p);
        p.selectStart();
      },
    );

    // Keep the HR isolated: only allow [zwsp, HR, zwsp] in the paragraph.
    // Any real content typed into the anchors is moved to a new paragraph.
    // Also clean up orphaned zwsp anchors when the HR/image/YouTube is deleted.
    const removeParagraphTransform = editor.registerNodeTransform(
      ParagraphNode,
      $normalizeHRParagraph,
    );

    // Backspace when cursor is right after an HR or image (in the right
    // zwsp anchor) should delete the node.
    const removeBackspace = editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return false;
        }

        const { anchor } = selection;
        if (anchor.type !== "text") return false;

        const textNode = anchor.getNode();
        if (!$isTextNode(textNode) || textNode.getTextContent() !== ZWSP) {
          return false;
        }

        // Check if the previous sibling is an HR or image.
        const prevSibling = textNode.getPreviousSibling();
        if (
          !prevSibling ||
          (!$isCometHorizontalRuleNode(prevSibling) &&
            !$isImageNode(prevSibling) &&
            !$isYouTubeNode(prevSibling))
        ) {
          return false;
        }

        event.preventDefault();
        const parent = prevSibling.getParent();
        prevSibling.remove();

        // Clean up: if the paragraph only has zwsp anchors left, clear it.
        if (parent) {
          const remaining = parent.getChildren();
          const allZwsp = remaining.every((c) => isAnchorText(c));
          if (allZwsp) {
            parent.clear();
            parent.selectStart();
          }
        }

        return true;
      },
      COMMAND_PRIORITY_LOW,
    );

    return () => {
      removeHrTransform();
      removeImageTransform();
      removeYouTubeTransform();
      removeTextTransform();
      removeParagraphTransform();
      removeBackspace();
    };
  }, [editor]);

  return null;
}
