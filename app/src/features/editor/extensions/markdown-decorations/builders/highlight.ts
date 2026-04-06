import { Decoration } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

import { overlapsAny } from "@/features/editor/extensions/markdown-decorations/cursor";
import type {
  BuilderContext,
  DecorationEntry,
} from "@/features/editor/extensions/markdown-decorations/types";

const highlightMark = Decoration.mark({ class: "cm-md-highlight" });

export function handleHighlight(
  node: SyntaxNodeRef,
  ctx: BuilderContext,
  out: DecorationEntry[],
): void {
  const resolved = node.node;
  const marks = resolved.getChildren("HighlightMark");
  const onCursor = overlapsAny(node.from, node.to, ctx.cursorRanges);

  // Always apply highlight styling
  out.push({ from: node.from, to: node.to, decoration: highlightMark });

  // Hide == delimiters when off cursor
  if (!onCursor) {
    for (const child of marks) {
      out.push({
        atomic: true,
        from: child.from,
        to: child.to,
        decoration: Decoration.replace({}),
      });
    }
  }
}
