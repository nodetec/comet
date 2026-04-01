import { RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import {
  type DecorationSet,
  Decoration,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

import {
  handleBlockquote,
  handleQuoteMark,
} from "@/features/editor/extensions/markdown-decorations/builders/blockquotes";
import { handleEmphasis } from "@/features/editor/extensions/markdown-decorations/builders/emphasis";
import { handleHighlight } from "@/features/editor/extensions/markdown-decorations/builders/highlight";
import { handleHeading } from "@/features/editor/extensions/markdown-decorations/builders/headings";
import { handleHorizontalRule } from "@/features/editor/extensions/markdown-decorations/builders/horizontal-rules";
import { handleInlineCode } from "@/features/editor/extensions/markdown-decorations/builders/inline-code";
import { handleLink } from "@/features/editor/extensions/markdown-decorations/builders/links";
import { handleStrikethrough } from "@/features/editor/extensions/markdown-decorations/builders/strikethrough";
import {
  getCursorLineRanges,
  getCursorRanges,
} from "@/features/editor/extensions/markdown-decorations/cursor";
import type {
  BuilderContext,
  NodeHandler,
} from "@/features/editor/extensions/markdown-decorations/types";

const NODE_HANDLERS: Record<string, NodeHandler> = {
  ATXHeading1: handleHeading,
  ATXHeading2: handleHeading,
  ATXHeading3: handleHeading,
  ATXHeading4: handleHeading,
  ATXHeading5: handleHeading,
  ATXHeading6: handleHeading,
  SetextHeading1: handleHeading,
  SetextHeading2: handleHeading,
  Emphasis: handleEmphasis,
  StrongEmphasis: handleEmphasis,
  InlineCode: handleInlineCode,
  Link: handleLink,
  Highlight: handleHighlight,
  Blockquote: handleBlockquote,
  QuoteMark: handleQuoteMark,
  HorizontalRule: handleHorizontalRule,
  Strikethrough: handleStrikethrough,
};

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const hasFocus = view.hasFocus;
  const ctx: BuilderContext = {
    state,
    cursorLines: hasFocus ? getCursorLineRanges(state) : [],
    cursorRanges: hasFocus ? getCursorRanges(state) : [],
    view,
  };
  const entries: Array<{ from: number; to: number; decoration: Decoration }> =
    [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        const handler = NODE_HANDLERS[node.name];
        if (handler) {
          handler(node, ctx, entries);
        }
      },
    });
  }

  // RangeSetBuilder requires entries sorted by from position
  entries.sort((a, b) => a.from - b.from || a.to - b.to);

  const builder = new RangeSetBuilder<Decoration>();
  for (const entry of entries) {
    if (entry.from <= entry.to) {
      builder.add(entry.from, entry.to, entry.decoration);
    }
  }
  return builder.finish();
}

export const markdownDecorationsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.focusChanged ||
        update.viewportChanged ||
        syntaxTree(update.state) !== syntaxTree(update.startState)
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
