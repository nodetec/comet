import { Decoration } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

import { overlapsAny } from "@/features/editor/extensions/markdown-decorations/cursor";
import type {
  BuilderContext,
  DecorationEntry,
} from "@/features/editor/extensions/markdown-decorations/types";

const codeMark = Decoration.mark({ class: "cm-md-code" });

export function handleInlineCode(
  node: SyntaxNodeRef,
  ctx: BuilderContext,
  out: DecorationEntry[],
): void {
  const resolved = node.node;
  const marks = resolved.getChildren("CodeMark");
  const onCursor = overlapsAny(node.from, node.to, ctx.cursorRanges);

  // Always apply code styling to the full span
  out.push({ from: node.from, to: node.to, decoration: codeMark });

  // Hide backtick delimiters when cursor is outside
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
