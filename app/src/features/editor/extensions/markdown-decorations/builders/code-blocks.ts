import { Decoration } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

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

  for (let n = openLine.number; n <= closeLine.number; n++) {
    const line = ctx.state.doc.line(n);
    let deco = codeBlockLine;

    if (n === openLine.number) {
      deco = codeBlockOpenLine;
    } else if (n === closeLine.number) {
      deco = codeBlockCloseLine;
    }

    out.push({ from: line.from, to: line.from, decoration: deco });
  }
}
