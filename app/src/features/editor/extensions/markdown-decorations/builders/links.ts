import { Decoration } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

import { overlapsAny } from "@/features/editor/extensions/markdown-decorations/cursor";
import type {
  BuilderContext,
  DecorationEntry,
} from "@/features/editor/extensions/markdown-decorations/types";

const linkMark = Decoration.mark({ class: "cm-md-link" });

export function handleLink(
  node: SyntaxNodeRef,
  ctx: BuilderContext,
  out: DecorationEntry[],
): void {
  const resolved = node.node;
  const onCursor = overlapsAny(node.from, node.to, ctx.cursorRanges);
  const marks = resolved.getChildren("LinkMark");

  if (marks.length < 2) {
    return;
  }

  // Apply link styling to visible text (between first [ and first ])
  const openBracket = marks[0]!;
  const closeBracket = marks[1]!;
  const textFrom = openBracket.to;
  const textTo = closeBracket.from;

  if (textFrom < textTo) {
    out.push({ from: textFrom, to: textTo, decoration: linkMark });
  }

  // Hide syntax when off cursor line
  if (!onCursor) {
    // Hide opening `[`
    out.push({
      from: openBracket.from,
      to: openBracket.to,
      decoration: Decoration.replace({}),
    });

    // Hide everything from `]` to end of node: `](url)` or `](url "title")`
    if (closeBracket.from < node.to) {
      out.push({
        from: closeBracket.from,
        to: node.to,
        decoration: Decoration.replace({}),
      });
    }
  }
}
