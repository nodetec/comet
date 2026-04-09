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

function hasActiveEditorFocus(view: EditorView) {
  return view.hasFocus && !view.dom.classList.contains("comet-editor-inactive");
}

function buildDecorations(
  view: EditorView,
  searchMatches: SearchMatch[],
): { atomicRanges: DecorationSet; decorations: DecorationSet } {
  const { state } = view;
  const hasFocus = hasActiveEditorFocus(view);
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

function queueDeferredSelectionRebuild(
  view: EditorView,
  pluginState: { pendingSelectionRebuild: boolean },
) {
  setTimeout(() => {
    requestAnimationFrame(() => {
      if (pluginState.pendingSelectionRebuild) {
        view.dispatch({});
      }
    });
  }, 0);
}

export function markdownDecorationsPlugin(searchQuery = "") {
  const plugin = ViewPlugin.fromClass(
    // ------------------------------------------------------------------
    // Decoration rebuild scheduling
    // ------------------------------------------------------------------
    //
    // Markdown decorations hide syntax characters (heading `# ` prefixes,
    // wikilink `[[`/`]]` brackets, etc.) when the cursor is not on their
    // line, and reveal them when the cursor moves there. This reveal/hide
    // toggle is driven by decoration rebuilds in the plugin's update()
    // method.
    //
    // Two problems arise from naive rebuilds:
    //
    // 1. **Accidental selection on click (mouseDown deferral)**
    //    When the user clicks on a line with hidden syntax, CM places the
    //    cursor based on the current (hidden) layout. A decoration rebuild
    //    then reveals the syntax, shifting the text. CM's mouse tracking
    //    sees the shifted layout on mouseup and creates a small selection
    //    instead of a cursor. Fix: freeze all decoration rebuilds while
    //    the mouse button is down. The deferred rebuild runs after mouseup
    //    on a later task / frame so the full click sequence settles before
    //    hidden prefixes are re-laid out.
    //
    // 2. **Jarring un-reveal on note switch (focus-loss deferral)**
    //    When the user clicks a note in the sidebar, the editor blurs
    //    before the new note content loads. An immediate focus-loss
    //    rebuild would hide all reveals (the cursor-line reveals become
    //    empty when unfocused), causing a visible flash before the note
    //    content swaps. Fix: defer the focus-loss rebuild by 100ms. If a
    //    docChanged update arrives first (the new note loaded), the
    //    pending rebuild is cancelled. If no content change comes (the
    //    user just clicked away), the deferred rebuild fires and hides
    //    the reveals normally.
    //
    // State flags:
    //   mouseDown              — true between mousedown and mouseup
    //   pendingSelectionRebuild — a selection or focus-gain rebuild was
    //                             deferred during a mouse gesture
    //   pendingFocusLossRebuild — a focus-loss rebuild is waiting for
    //                             either a docChanged (cancel) or the
    //                             100ms timeout (execute)
    // ------------------------------------------------------------------
    class {
      atomicRanges: DecorationSet;
      decorations: DecorationSet;
      searchMatches: SearchMatch[];
      mouseDown = false;
      pendingSelectionRebuild = false;
      pendingFocusLossRebuild = false;

      constructor(view: EditorView) {
        this.searchMatches = searchQuery
          ? collectSearchMatches(view.state.doc.toString(), searchQuery)
          : [];
        const { atomicRanges, decorations } = buildDecorations(
          view,
          this.searchMatches,
        );
        this.atomicRanges = atomicRanges;
        this.decorations = decorations;
      }

      handleMouseDownUpdate(update: ViewUpdate) {
        if (update.docChanged) {
          this.rebuildFromUpdate(update);
        }
        if (
          (update.selectionSet &&
            selectionAffectsDecorations(update.startState, update.state)) ||
          (update.focusChanged && update.view.hasFocus)
        ) {
          this.pendingSelectionRebuild = true;
        }
      }

      collectRebuildReasons(update: ViewUpdate): string[] {
        const reasons: string[] = [];

        if (this.pendingSelectionRebuild) {
          this.pendingSelectionRebuild = false;
          reasons.push("deferredSelectionSet");
        }

        if (this.pendingFocusLossRebuild && !update.focusChanged) {
          this.pendingFocusLossRebuild = false;
          if (!update.docChanged) {
            reasons.push("deferredFocusLoss");
          }
        }

        if (update.docChanged) {
          this.pendingFocusLossRebuild = false;
          reasons.push("docChanged");
        }
        if (
          update.selectionSet &&
          selectionAffectsDecorations(update.startState, update.state)
        ) {
          reasons.push("selectionSet");
        }
        if (update.focusChanged) {
          if (update.view.hasFocus) {
            reasons.push("focusChanged");
          } else {
            this.pendingFocusLossRebuild = true;
            setTimeout(() => {
              if (this.pendingFocusLossRebuild) {
                update.view.dispatch({});
              }
            }, 100);
          }
        }
        if (update.viewportChanged) reasons.push("viewportChanged");
        if (syntaxTree(update.state) !== syntaxTree(update.startState)) {
          reasons.push("syntaxTreeChanged");
        }

        return reasons;
      }

      rebuildFromUpdate(update: ViewUpdate) {
        if (update.docChanged) {
          this.searchMatches = searchQuery
            ? collectSearchMatches(update.state.doc.toString(), searchQuery)
            : [];
        }

        if (isEditorDebugEnabled()) {
          logEditorDebug("markdown-decorations", "plugin update", {
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

      update(update: ViewUpdate) {
        if (this.mouseDown) {
          this.handleMouseDownUpdate(update);
          return;
        }

        const reasons = this.collectRebuildReasons(update);
        if (reasons.length > 0) {
          this.rebuildFromUpdate(update);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
      provide: (p) =>
        EditorView.atomicRanges.of(
          (view) => view.plugin(p)?.atomicRanges ?? Decoration.none,
        ),
      eventHandlers: {
        mousedown(_, view) {
          this.mouseDown = true;
          const onMouseUp = () => {
            document.removeEventListener("mouseup", onMouseUp);
            this.mouseDown = false;
            if (this.pendingSelectionRebuild) {
              queueDeferredSelectionRebuild(view, this);
            }
          };
          document.addEventListener("mouseup", onMouseUp);
        },
      },
    },
  );

  return plugin;
}
