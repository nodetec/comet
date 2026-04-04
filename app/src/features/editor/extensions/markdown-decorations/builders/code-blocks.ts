import { Decoration } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

import { overlapsAny } from "@/features/editor/extensions/markdown-decorations/cursor";
import type {
  BuilderContext,
  DecorationEntry,
} from "@/features/editor/extensions/markdown-decorations/types";

const CODE_BLOCK_NODES = new Set(["CodeBlock", "FencedCode", "HTMLBlock"]);

const codeBlockLine = Decoration.line({
  attributes: {
    class: "cm-md-codeblock",
    spellcheck: "false",
  },
});
const codeBlockOpenLine = Decoration.line({
  attributes: {
    class: "cm-md-codeblock cm-md-codeblock-open",
    spellcheck: "false",
  },
});
const codeBlockCloseLine = Decoration.line({
  attributes: {
    class: "cm-md-codeblock cm-md-codeblock-close",
    spellcheck: "false",
  },
});
const hiddenFenceMark = Decoration.mark({
  class: "cm-md-codeblock-fence-hidden",
});
const codeBlockContentMark = Decoration.mark({
  class: "cm-md-codeblock-content",
});

export function handleCodeBlock(
  node: SyntaxNodeRef,
  ctx: BuilderContext,
  out: DecorationEntry[],
): void {
  if (!CODE_BLOCK_NODES.has(node.name)) {
    return;
  }

  const openLine = ctx.state.doc.lineAt(node.from);
  const closeLine = ctx.state.doc.lineAt(node.to);
  const revealFences =
    node.name !== "FencedCode" ||
    overlapsAny(node.from, node.to, ctx.cursorRanges);

  for (let n = openLine.number; n <= closeLine.number; n++) {
    const line = ctx.state.doc.line(n);
    let deco = codeBlockLine;
    let hideFence = false;

    if (n === openLine.number) {
      deco = codeBlockOpenLine;
      hideFence = !revealFences;
    } else if (n === closeLine.number) {
      deco = codeBlockCloseLine;
      hideFence = !revealFences;
    }

    out.push({ from: line.from, to: line.from, decoration: deco });
    if (!hideFence && line.from < line.to) {
      out.push({
        from: line.from,
        to: line.to,
        decoration: codeBlockContentMark,
      });
    }
    if (hideFence && line.from < line.to) {
      out.push({
        from: line.from,
        to: line.to,
        decoration: hiddenFenceMark,
      });
    }
  }
}
