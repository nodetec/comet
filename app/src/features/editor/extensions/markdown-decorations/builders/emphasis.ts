import { Decoration } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

import { overlapsAny } from "@/features/editor/extensions/markdown-decorations/cursor";
import type {
  BuilderContext,
  DecorationEntry,
} from "@/features/editor/extensions/markdown-decorations/types";

const emphasisMark = Decoration.mark({ class: "cm-md-emphasis" });
const strongMark = Decoration.mark({ class: "cm-md-strong" });

export function handleEmphasis(
  node: SyntaxNodeRef,
  ctx: BuilderContext,
  out: DecorationEntry[],
): void {
  const isStrong = node.name === "StrongEmphasis";
  const mark = isStrong ? strongMark : emphasisMark;
  const resolved = node.node;
  const marks = resolved.getChildren("EmphasisMark");
  const onCursor = overlapsAny(node.from, node.to, ctx.cursorRanges);

  // Always apply styling
  out.push({ from: node.from, to: node.to, decoration: mark });

  // Hide delimiter marks when off cursor line
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
