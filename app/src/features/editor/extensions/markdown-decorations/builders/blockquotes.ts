import { Decoration } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

import { overlapsAny } from "@/features/editor/extensions/markdown-decorations/cursor";
import type {
  BuilderContext,
  DecorationEntry,
} from "@/features/editor/extensions/markdown-decorations/types";

const MAX_DEPTH = 4;

const blockquoteDecoCache: Decoration[] = [];
function getBlockquoteDeco(depth: number): Decoration {
  const d = Math.min(depth, MAX_DEPTH);
  if (!blockquoteDecoCache[d]) {
    blockquoteDecoCache[d] = Decoration.line({
      class: `cm-md-bq cm-md-bq-${d}`,
    });
  }
  return blockquoteDecoCache[d];
}

export function handleBlockquote(
  node: SyntaxNodeRef,
  ctx: BuilderContext,
  out: DecorationEntry[],
): void {
  // Only process from the outermost blockquote
  if (node.node.parent?.name === "Blockquote") {
    return;
  }

  // Count QuoteMarks per line to determine nesting depth
  const quoteMarksByLine = new Map<number, number>();
  node.node.cursor().iterate((n) => {
    if (n.name === "QuoteMark") {
      const lineNum = ctx.state.doc.lineAt(n.from).number;
      quoteMarksByLine.set(lineNum, (quoteMarksByLine.get(lineNum) ?? 0) + 1);
    }
  });

  for (const [lineNum, depth] of quoteMarksByLine) {
    const line = ctx.state.doc.line(lineNum);
    if (overlapsAny(line.from, line.to, ctx.cursorLines)) {
      continue;
    }

    out.push({
      from: line.from,
      to: line.from,
      decoration: getBlockquoteDeco(depth),
    });
  }
}

export function handleQuoteMark(
  node: SyntaxNodeRef,
  ctx: BuilderContext,
  out: DecorationEntry[],
): void {
  const onCursor = overlapsAny(node.from, node.to, ctx.cursorLines);

  if (!onCursor) {
    // Hide the `>` and any trailing space
    const line = ctx.state.doc.lineAt(node.from);
    const afterMark = node.to;
    const endOfPrefix =
      afterMark < line.to && line.text[afterMark - line.from] === " "
        ? afterMark + 1
        : afterMark;

    out.push({
      atomic: true,
      from: node.from,
      to: endOfPrefix,
      decoration: Decoration.replace({}),
    });
  }
}
