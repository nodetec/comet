import { RangeSetBuilder, type SelectionRange } from "@codemirror/state";
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
import {
  addPlainExternalLinkDecorations,
  handleLink,
} from "@/features/editor/extensions/markdown-decorations/builders/links";
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
import {
  isEditorDebugEnabled,
  logEditorDebug,
  summarizeRanges,
} from "@/shared/lib/editor-debug";
import type { SearchMatch } from "@/shared/lib/search";
import { collectSearchMatches } from "@/shared/lib/search";

const VISIBLE_RANGE_MARGIN = 1000;

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
  "Link",
  "Highlight",
  "Blockquote",
  "QuoteMark",
  "HorizontalRule",
  "Strikethrough",
]);

function selectionAffectsDecorations(
  previousState: EditorView["state"],
  nextState: EditorView["state"],
) {
  const previousRanges = previousState.selection.ranges;
  const nextRanges = nextState.selection.ranges;

  if (previousRanges.length !== nextRanges.length) return true;
  if (selectionEmptinessChanged(previousRanges, nextRanges)) return true;
  if (!hasCaretSelection(nextRanges)) return false;
  return caretHeadsChanged(previousState, nextState);
}

function selectionEmptinessChanged(
  previousRanges: readonly SelectionRange[],
  nextRanges: readonly SelectionRange[],
) {
  for (const [index, previousRange] of previousRanges.entries()) {
    const nextRange = nextRanges[index];
    if (!nextRange || previousRange.empty !== nextRange.empty) {
      return true;
    }
  }

  return false;
}

function hasCaretSelection(ranges: readonly SelectionRange[]) {
  return ranges.some((range) => range.empty);
}

function caretHeadsChanged(
  previousState: EditorView["state"],
  nextState: EditorView["state"],
) {
  for (const [
    index,
    previousRange,
  ] of previousState.selection.ranges.entries()) {
    const nextRange = nextState.selection.ranges[index];
    if (!previousRange.empty && !nextRange?.empty) {
      continue;
    }

    if (!nextRange || previousRange.head !== nextRange.head) {
      return true;
    }

    const previousLine = previousState.doc.lineAt(previousRange.head);
    const nextLine = nextState.doc.lineAt(nextRange.head);
    if (
      previousLine.from !== nextLine.from ||
      previousLine.to !== nextLine.to
    ) {
      return true;
    }
  }

  return false;
}

function expandedVisibleRanges(
  view: EditorView,
): readonly { from: number; to: number }[] {
  const docLength = view.state.doc.length;
  return view.visibleRanges.map(({ from, to }) => ({
    from: Math.max(0, from - VISIBLE_RANGE_MARGIN),
    to: Math.min(docLength, to + VISIBLE_RANGE_MARGIN),
  }));
}

function buildDecorations(
  view: EditorView,
  searchMatches: SearchMatch[],
): DecorationSet {
  const { state } = view;
  const hasFocus = view.hasFocus;
  const debugEnabled = isEditorDebugEnabled();
  const ranges = expandedVisibleRanges(view);
  const ctx: BuilderContext = {
    state,
    cursorLines: hasFocus ? getCursorLineRanges(state) : [],
    cursorRanges: hasFocus ? getCursorRanges(state) : [],
    searchMatches,
    view,
  };
  const entries: Array<{ from: number; to: number; decoration: Decoration }> =
    [];
  const handlerCounts = debugEnabled ? new Map<string, number>() : null;

  for (const range of ranges) {
    syntaxTree(state).iterate({
      from: range.from,
      to: range.to,
      enter(node) {
        if (
          SEARCH_REVEAL_NODE_NAMES.has(node.name) &&
          overlapsAny(node.from, node.to, searchMatches)
        ) {
          return false;
        }

        const handler = NODE_HANDLERS[node.name];
        if (handler) {
          if (handlerCounts) {
            handlerCounts.set(
              node.name,
              (handlerCounts.get(node.name) ?? 0) + 1,
            );
          }
          handler(node, ctx, entries);
        }
      },
    });
  }

  addPlainExternalLinkDecorations(ctx, entries, ranges);

  // RangeSetBuilder requires entries sorted by from position
  entries.sort((a, b) => a.from - b.from || a.to - b.to);

  const builder = new RangeSetBuilder<Decoration>();
  for (const entry of entries) {
    if (entry.from <= entry.to) {
      builder.add(entry.from, entry.to, entry.decoration);
    }
  }

  if (debugEnabled) {
    logEditorDebug("markdown-decorations", "rebuilt decorations", {
      docLength: state.doc.length,
      entryCount: entries.length,
      focus: hasFocus,
      handlerCounts: handlerCounts
        ? Object.fromEntries(handlerCounts.entries())
        : undefined,
      searchMatchCount: searchMatches.length,
      visibleRanges: summarizeRanges(view.visibleRanges),
      viewport: `${view.viewport.from}-${view.viewport.to}`,
    });
  }

  return builder.finish();
}

export function markdownDecorationsPlugin(searchQuery = "") {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      searchMatches: SearchMatch[];

      constructor(view: EditorView) {
        this.searchMatches = collectSearchMatches(
          view.state.doc.toString(),
          searchQuery,
        );
        this.decorations = buildDecorations(view, this.searchMatches);
      }

      update(update: ViewUpdate) {
        const reasons = [];
        if (update.docChanged) reasons.push("docChanged");
        if (
          update.selectionSet &&
          selectionAffectsDecorations(update.startState, update.state)
        ) {
          reasons.push("selectionSet");
        }
        if (update.focusChanged) reasons.push("focusChanged");
        if (update.viewportChanged) reasons.push("viewportChanged");
        if (syntaxTree(update.state) !== syntaxTree(update.startState)) {
          reasons.push("syntaxTreeChanged");
        }

        if (reasons.length > 0) {
          if (update.docChanged) {
            this.searchMatches = collectSearchMatches(
              update.state.doc.toString(),
              searchQuery,
            );
          }

          if (isEditorDebugEnabled()) {
            logEditorDebug("markdown-decorations", "plugin update", {
              reasons,
              visibleRanges: summarizeRanges(update.view.visibleRanges),
              viewport: `${update.view.viewport.from}-${update.view.viewport.to}`,
            });
          }
          this.decorations = buildDecorations(update.view, this.searchMatches);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}
