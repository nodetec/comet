import { Decoration, WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

import { overlapsAny } from "@/features/editor/extensions/markdown-decorations/cursor";
import type {
  BuilderContext,
  DecorationEntry,
} from "@/features/editor/extensions/markdown-decorations/types";

class HorizontalRuleWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const hr = document.createElement("hr");
    hr.className = "cm-md-hr";
    return hr;
  }
}

const hrWidget = Decoration.replace({
  widget: new HorizontalRuleWidget(),
  block: true,
});

export function handleHorizontalRule(
  node: SyntaxNodeRef,
  ctx: BuilderContext,
  out: DecorationEntry[],
): void {
  const onCursor = overlapsAny(node.from, node.to, ctx.cursorLines);

  if (!onCursor) {
    out.push({ from: node.from, to: node.to, decoration: hrWidget });
  }
}
