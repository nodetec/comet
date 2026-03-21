import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $createTextNode,
  $isParagraphNode,
  $isRootNode,
  $isTextNode,
  ParagraphNode,
  TextNode,
} from "lexical";
import {
  $createCometHorizontalRuleNode,
  $isCometHorizontalRuleNode,
  CometHorizontalRuleNode,
} from "../nodes/comet-horizontal-rule-node";
import { ImageNode } from "../nodes/image-node";

/** Zero-width space used as cursor anchor beside the HR. */
const ZWSP = "\u200B";

function isAnchorText(
  node: ReturnType<typeof import("lexical").$getNodeByKey>,
): boolean {
  return $isTextNode(node) && node.getTextContent() === ZWSP;
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
    const removeParagraphTransform = editor.registerNodeTransform(
      ParagraphNode,
      (paragraphNode) => {
        const children = paragraphNode.getChildren();
        const hrIndex = children.findIndex($isCometHorizontalRuleNode);
        if (hrIndex === -1) return;

        // Check if the paragraph is already in the correct shape.
        const isCorrect =
          children.length === 3 &&
          hrIndex === 1 &&
          isAnchorText(children[0]) &&
          isAnchorText(children[2]);
        if (isCorrect) return;

        console.log(
          "[HR] Paragraph not in correct shape, normalizing:",
          children.map((c) =>
            $isCometHorizontalRuleNode(c)
              ? "HR"
              : JSON.stringify(c.getTextContent()),
          ),
        );

        // Collect non-anchor, non-HR children as "spill" content.
        const spillBefore: typeof children = [];
        const spillAfter: typeof children = [];
        let seenHR = false;

        for (const child of children) {
          if ($isCometHorizontalRuleNode(child)) {
            seenHR = true;
            continue;
          }
          if (isAnchorText(child)) continue;

          // Strip zwsp from text nodes that have mixed content.
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

        if (spillAfter.length > 0) {
          console.log(
            "[HR] Moving spill-after content to new paragraph:",
            spillAfter.map((c) => JSON.stringify(c.getTextContent())),
          );
          const p = $createParagraphNode();
          for (const child of spillAfter) {
            p.append(child);
          }
          paragraphNode.insertAfter(p);
          p.selectEnd();
        }

        if (spillBefore.length > 0) {
          console.log(
            "[HR] Moving spill-before content to new paragraph:",
            spillBefore.map((c) => JSON.stringify(c.getTextContent())),
          );
          const p = $createParagraphNode();
          for (const child of spillBefore) {
            p.append(child);
          }
          paragraphNode.insertBefore(p);
        }
      },
    );

    return () => {
      removeHrTransform();
      removeImageTransform();
      removeTextTransform();
      removeParagraphTransform();
    };
  }, [editor]);

  return null;
}
