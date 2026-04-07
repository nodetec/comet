import { Decoration } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

import { overlapsAny } from "@/features/editor/extensions/markdown-decorations/cursor";
import type {
  BuilderContext,
  DecorationEntry,
} from "@/features/editor/extensions/markdown-decorations/types";

const wikilinkMark = Decoration.mark({ class: "cm-md-link cm-md-wikilink" });
const wikilinkBracketMark = Decoration.mark({
  class: "cm-md-wikilink-bracket",
});

export function handleWikiLink(
  node: SyntaxNodeRef,
  ctx: BuilderContext,
  out: DecorationEntry[],
): void {
  const onCursor = overlapsAny(node.from, node.to, ctx.cursorRanges);
  const textFrom = node.from + 2;
  const textTo = node.to - 2;

  if (textFrom < textTo) {
    out.push({ from: textFrom, to: textTo, decoration: wikilinkMark });
  }

  if (onCursor) {
    out.push(
      {
        from: node.from,
        to: textFrom,
        decoration: wikilinkBracketMark,
      },
      {
        from: textTo,
        to: node.to,
        decoration: wikilinkBracketMark,
      },
    );
  } else {
    out.push(
      {
        atomic: true,
        from: node.from,
        to: textFrom,
        decoration: Decoration.replace({}),
      },
      {
        atomic: true,
        from: textTo,
        to: node.to,
        decoration: Decoration.replace({}),
      },
    );
  }
}
