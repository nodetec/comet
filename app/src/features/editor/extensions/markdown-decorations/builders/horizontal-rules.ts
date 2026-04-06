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

  override ignoreEvent(): boolean {
    return false;
  }

  override toDOM(): HTMLElement {
    const separator = document.createElement("span");
    separator.className = "cm-md-hr";
    separator.setAttribute("aria-hidden", "true");
    return separator;
  }
}

export function handleHorizontalRule(
  node: SyntaxNodeRef,
  ctx: BuilderContext,
  out: DecorationEntry[],
): void {
  const onCursor = overlapsAny(node.from, node.to, ctx.cursorLines);

  if (!onCursor) {
    out.push({
      atomic: true,
      from: node.from,
      to: node.to,
      decoration: Decoration.replace({
        widget: new HorizontalRuleWidget(),
      }),
    });
  }
}
