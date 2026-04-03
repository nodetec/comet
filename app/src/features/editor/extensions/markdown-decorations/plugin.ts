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
import { handleCodeBlock } from "@/features/editor/extensions/markdown-decorations/builders/code-blocks";
import { handleInlineCode } from "@/features/editor/extensions/markdown-decorations/builders/inline-code";
import { handleLink } from "@/features/editor/extensions/markdown-decorations/builders/links";
import { handleStrikethrough } from "@/features/editor/extensions/markdown-decorations/builders/strikethrough";
import {
  getCursorLineRanges,
  getCursorRanges,
  overlapsAny,
} from "@/features/editor/extensions/markdown-decorations/cursor";
import type {
  BuilderContext,
  NodeHandler,
} from "@/features/editor/extensions/markdown-decorations/types";
import { collectSearchMatches } from "@/shared/lib/search";

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
  FencedCode: handleCodeBlock,
  CodeBlock: handleCodeBlock,
  Link: handleLink,
  Highlight: handleHighlight,
  Blockquote: handleBlockquote,
  QuoteMark: handleQuoteMark,
  HorizontalRule: handleHorizontalRule,
  Strikethrough: handleStrikethrough,
};

const SEARCH_REVEAL_NODE_NAMES = new Set([
  "Emphasis",
  "StrongEmphasis",
  "InlineCode",
  "FencedCode",
  "CodeBlock",
  "Link",
  "Highlight",
  "Blockquote",
  "QuoteMark",
  "HorizontalRule",
  "Strikethrough",
]);

function buildDecorations(
  view: EditorView,
  searchQuery: string,
): DecorationSet {
  const { state } = view;
  const hasFocus = view.hasFocus;
  const searchMatches = collectSearchMatches(state.doc.toString(), searchQuery);
  const ctx: BuilderContext = {
    state,
    cursorLines: hasFocus ? getCursorLineRanges(state) : [],
    cursorRanges: hasFocus ? getCursorRanges(state) : [],
    searchMatches,
    view,
  };
  const entries: Array<{ from: number; to: number; decoration: Decoration }> =
    [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (
          SEARCH_REVEAL_NODE_NAMES.has(node.name) &&
          overlapsAny(node.from, node.to, searchMatches)
        ) {
          return false;
        }

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

export function markdownDecorationsPlugin(searchQuery = "") {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, searchQuery);
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.selectionSet ||
          update.focusChanged ||
          update.viewportChanged ||
          syntaxTree(update.state) !== syntaxTree(update.startState)
        ) {
          this.decorations = buildDecorations(update.view, searchQuery);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}
