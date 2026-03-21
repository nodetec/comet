import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createParagraphNode, $isRootNode, ParagraphNode } from "lexical";
import {
  $isCometHorizontalRuleNode,
  CometHorizontalRuleNode,
} from "../nodes/comet-horizontal-rule-node";

/**
 * Keeps the inline HR well-behaved inside paragraphs.
 *
 * - HR transform: wraps root-level HRs in a paragraph (they're inline nodes
 *   and need a block parent for proper cursor flow).
 * - Paragraph transform: if text ends up next to an HR in the same paragraph,
 *   splits it out so the HR stays alone.
 */
export default function HorizontalRuleCursorPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Wrap root-level HRs in a paragraph.
    const removeHrTransform = editor.registerNodeTransform(
      CometHorizontalRuleNode,
      (node) => {
        const parent = node.getParent();
        if (parent && $isRootNode(parent)) {
          const p = $createParagraphNode();
          node.insertBefore(p);
          p.append(node);
        }
      },
    );

    // Keep the HR alone in its paragraph.
    const removeParagraphTransform = editor.registerNodeTransform(
      ParagraphNode,
      (paragraphNode) => {
        const children = paragraphNode.getChildren();
        const hrIndex = children.findIndex($isCometHorizontalRuleNode);
        if (hrIndex === -1 || children.length === 1) return;

        const before = children.slice(0, hrIndex);
        const after = children.slice(hrIndex + 1);

        if (after.length > 0) {
          const p = $createParagraphNode();
          for (const child of after) {
            p.append(child);
          }
          paragraphNode.insertAfter(p);
          p.selectEnd();
        }

        if (before.length > 0) {
          const p = $createParagraphNode();
          for (const child of before) {
            p.append(child);
          }
          paragraphNode.insertBefore(p);
        }
      },
    );

    return () => {
      removeHrTransform();
      removeParagraphTransform();
    };
  }, [editor]);

  return null;
}
