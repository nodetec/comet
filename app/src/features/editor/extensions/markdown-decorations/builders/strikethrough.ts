import { Decoration } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

import { overlapsAny } from "@/features/editor/extensions/markdown-decorations/cursor";
import type {
  BuilderContext,
  DecorationEntry,
} from "@/features/editor/extensions/markdown-decorations/types";

const strikethroughMark = Decoration.mark({ class: "cm-md-strikethrough" });

export function handleStrikethrough(
  node: SyntaxNodeRef,
  ctx: BuilderContext,
  out: DecorationEntry[],
): void {
  const resolved = node.node;
  const onCursor = overlapsAny(node.from, node.to, ctx.cursorRanges);

  // Always apply styling
  out.push({ from: node.from, to: node.to, decoration: strikethroughMark });

  // Hide ~~ delimiters when off cursor line
  if (!onCursor) {
    for (const child of resolved.getChildren("StrikethroughMark")) {
      out.push({
        from: child.from,
        to: child.to,
        decoration: Decoration.replace({}),
      });
    }
  }
}
