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
import {
  addPlainExternalLinkDecorations,
  handleLink,
} from "@/features/editor/extensions/markdown-decorations/builders/links";
import { handleStrikethrough } from "@/features/editor/extensions/markdown-decorations/builders/strikethrough";
import { handleWikiLink } from "@/features/editor/extensions/markdown-decorations/builders/wikilinks";
import {
  getCursorLineRanges,
  getCursorRanges,
  overlapsAny,
} from "@/features/editor/extensions/markdown-decorations/cursor";
import type {
  BuilderContext,
  DecorationEntry,
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
  WikiLink: handleWikiLink,
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
  "WikiLink",
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

  for (const [index, previousRange] of previousRanges.entries()) {
    const nextRange = nextRanges[index];
    if (!nextRange || previousRange.empty !== nextRange.empty) return true;

    if (previousRange.empty) {
      if (previousRange.head !== nextRange.head) return true;
    } else if (
      previousRange.from !== nextRange.from ||
      previousRange.to !== nextRange.to
    ) {
      return true;
    }
  }

  return false;
}

function expandedVisibleRanges(
  view: EditorView,
): { from: number; to: number }[] {
  const docLength = view.state.doc.length;
  const ranges: { from: number; to: number }[] = [];

  for (const { from, to } of view.visibleRanges) {
    const expanded = {
      from: Math.max(0, from - VISIBLE_RANGE_MARGIN),
      to: Math.min(docLength, to + VISIBLE_RANGE_MARGIN),
    };
    // eslint-disable-next-line unicorn/prefer-at
    const last = ranges.length > 0 ? ranges[ranges.length - 1] : undefined;
    if (last && expanded.from <= last.to) {
      last.to = Math.max(last.to, expanded.to);
    } else {
      ranges.push(expanded);
    }
  }

  return ranges;
}

function buildDecorations(
  view: EditorView,
  searchMatches: SearchMatch[],
): { atomicRanges: DecorationSet; decorations: DecorationSet } {
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
  const entries: DecorationEntry[] = [];
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
  const atomicBuilder = new RangeSetBuilder<Decoration>();
  for (const entry of entries) {
    if (entry.from <= entry.to) {
      builder.add(entry.from, entry.to, entry.decoration);
      if (entry.atomic) {
        atomicBuilder.add(entry.from, entry.to, entry.decoration);
      }
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

  return {
    atomicRanges: atomicBuilder.finish(),
    decorations: builder.finish(),
  };
}

export function markdownDecorationsPlugin(searchQuery = "") {
  return ViewPlugin.fromClass(
    class {
      atomicRanges: DecorationSet;
      decorations: DecorationSet;
      searchMatches: SearchMatch[];

      constructor(view: EditorView) {
        this.searchMatches = collectSearchMatches(
          view.state.doc.toString(),
          searchQuery,
        );
        const { atomicRanges, decorations } = buildDecorations(
          view,
          this.searchMatches,
        );
        this.atomicRanges = atomicRanges;
        this.decorations = decorations;
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
          const { atomicRanges, decorations } = buildDecorations(
            update.view,
            this.searchMatches,
          );
          this.atomicRanges = atomicRanges;
          this.decorations = decorations;
        }
      }
    },
    {
      decorations: (v) => v.decorations,
      provide: (plugin) =>
        EditorView.atomicRanges.of(
          (view) => view.plugin(plugin)?.atomicRanges ?? Decoration.none,
        ),
    },
  );
}
