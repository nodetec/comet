import { Decoration } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

import type {
  BuilderContext,
  DecorationEntry,
} from "@/features/editor/extensions/markdown-decorations/types";

const blockquoteLine = Decoration.line({ class: "cm-md-blockquote" });

export function handleBlockquote(
  node: SyntaxNodeRef,
  ctx: BuilderContext,
  out: DecorationEntry[],
): void {
  // Add a line decoration to each line in the blockquote
  const startLine = ctx.state.doc.lineAt(node.from);
  const endLine = ctx.state.doc.lineAt(node.to);

  for (let n = startLine.number; n <= endLine.number; n++) {
    const line = ctx.state.doc.line(n);
    out.push({ from: line.from, to: line.from, decoration: blockquoteLine });
  }
}
