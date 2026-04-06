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
  const marks = resolved.getChildren("StrikethroughMark");
  const onCursor = overlapsAny(node.from, node.to, ctx.cursorRanges);

  // Apply line-through only to content between delimiters
  const contentFrom = marks.length > 0 ? marks[0]!.to : node.from;
  // eslint-disable-next-line unicorn/prefer-at
  const contentTo = marks.length > 1 ? marks[marks.length - 1]!.from : node.to;
  if (contentFrom < contentTo) {
    out.push({
      from: contentFrom,
      to: contentTo,
      decoration: strikethroughMark,
    });
  }

  // Hide ~~ delimiters when off cursor
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
