import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown as markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import {
  type SearchQuery,
  SearchQuery as CodeMirrorSearchQuery,
  getSearchQuery,
  search,
  setSearchQuery,
} from "@codemirror/search";
import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightSpecialChars,
  keymap,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

import { scrollCenterOnEnter } from "@/features/editor/lib/scroll-center-on-enter";
import { useShellStore } from "@/features/shell/store/use-shell-store";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

type NoteEditorProps = {
  focusMode: "none" | "immediate" | "pointerup";
  loadKey: string;
  markdown: string;
  onEditorFocusChange?(focused: boolean): void;
  onSearchMatchCountChange?(count: number): void;
  readOnly: boolean;
  searchHighlightAllMatchesYellow?: boolean;
  searchActiveMatchIndex?: number | null;
  searchQuery: string;
  searchScrollRevision?: number;
  spellCheck?: boolean;
  toolbarContainer: HTMLElement | null;
  onChange(markdown: string): void;
  onFocusHandled(): void;
};

export type NoteEditorHandle = {
  blur(): void;
  focus(): void;
  focusAtSurfacePoint(clientX: number, clientY: number): boolean;
};

const MARKDOWN_HIGHLIGHT_STYLE = HighlightStyle.define([
  { tag: t.heading, color: "var(--foreground)", fontWeight: "700" },
  { tag: [t.emphasis], fontStyle: "italic" },
  { tag: [t.strong], fontWeight: "700" },
  {
    tag: [t.monospace, t.literal],
    color: "var(--syntax-string)",
    fontFamily:
      '"SF Mono", "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  { tag: [t.link, t.url], color: "var(--syntax-link)" },
  { tag: [t.quote], color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: [t.comment, t.processingInstruction], color: "var(--syntax-comment)" },
  { tag: [t.contentSeparator], color: "var(--muted-foreground)" },
  { tag: [t.list], color: "var(--muted-foreground)" },
]);

const MARKDOWN_EDITOR_THEME = EditorView.theme({
  "&": {
    minHeight: "100%",
    background: "transparent",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    minHeight: "100%",
    overflow: "visible",
    fontFamily: '"Figtree Variable", sans-serif',
  },
  ".cm-content": {
    minHeight: "100%",
    color: "var(--editor-text)",
    caretColor: "var(--editor-caret)",
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--editor-caret)",
  },
  ".cm-selectionBackground": {
    backgroundColor: "color-mix(in oklab, var(--accent) 35%, transparent)",
  },
});

const TOOLBAR_BUTTONS = [
  { key: "heading", label: "H1" },
  { key: "bold", label: "B" },
  { key: "italic", label: "I" },
  { key: "code", label: "`" },
  { key: "link", label: "Link" },
  { key: "bullet", label: "List" },
  { key: "todo", label: "Todo" },
  { key: "quote", label: "Quote" },
] as const;

type ToolbarAction = (typeof TOOLBAR_BUTTONS)[number]["key"];

function countSearchMatches(state: EditorState, query: SearchQuery): number {
  if (!query.valid) {
    return 0;
  }

  let count = 0;
  const cursor = query.getCursor(state);
  while (!cursor.next().done) {
    count++;
  }
  return count;
}

function findMatchAtIndex(
  state: EditorState,
  query: SearchQuery,
  index: number,
): { from: number; to: number } | null {
  if (!query.valid || index < 0) {
    return null;
  }

  let currentIndex = 0;
  const cursor = query.getCursor(state);
  for (;;) {
    const next = cursor.next();
    if (next.done) {
      break;
    }
    const match = next.value;
    if (currentIndex === index) {
      return match;
    }
    currentIndex++;
  }

  return null;
}

function replaceSelection(
  view: EditorView,
  text: string,
  selection: { anchor: number; head?: number },
): void {
  const range = view.state.selection.main;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: text },
    selection: EditorSelection.range(
      selection.anchor,
      selection.head ?? selection.anchor,
    ),
    scrollIntoView: true,
  });
  view.focus();
}

function focusEditorFromSurfacePoint(
  view: EditorView,
  clientX: number,
  clientY: number,
): boolean {
  const contentRect = view.contentDOM.getBoundingClientRect();
  if (clientY < contentRect.top || clientY > contentRect.bottom) {
    return false;
  }

  let targetX: number | null = null;
  if (clientX < contentRect.left) {
    targetX = contentRect.left + 1;
  } else if (clientX > contentRect.right) {
    targetX = contentRect.right - 1;
  }

  if (targetX === null) {
    return false;
  }

  const position = view.posAtCoords({ x: targetX, y: clientY }, false);
  view.dispatch({
    selection: EditorSelection.cursor(position),
    scrollIntoView: false,
  });
  view.focus();
  return true;
}

function wrapSelection(
  view: EditorView,
  before: string,
  after = before,
  placeholder = "",
): void {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const inner = selected || placeholder;
  const content = `${before}${inner}${after}`;
  const anchor = from + before.length;
  const head = anchor + inner.length;

  replaceSelection(view, content, { anchor, head });
}

function prefixCurrentLine(view: EditorView, prefix: string): void {
  const { head } = view.state.selection.main;
  const line = view.state.doc.lineAt(head);
  const nextHead = head + prefix.length;

  view.dispatch({
    changes: { from: line.from, insert: prefix },
    selection: { anchor: nextHead, head: nextHead },
    scrollIntoView: true,
  });
  view.focus();
}

function prefixSelectedLines(view: EditorView, prefix: string): void {
  const { main } = view.state.selection;
  const startLine = view.state.doc.lineAt(main.from).number;
  const endLine = view.state.doc.lineAt(main.to).number;
  const changes: Array<{ from: number; insert: string }> = [];
  let anchorDelta = 0;
  let headDelta = 0;

  for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
    const line = view.state.doc.line(lineNumber);
    changes.push({ from: line.from, insert: prefix });
    if (line.from <= main.anchor) {
      anchorDelta += prefix.length;
    }
    if (line.from <= main.head) {
      headDelta += prefix.length;
    }
  }

  view.dispatch({
    changes,
    selection: {
      anchor: main.anchor + anchorDelta,
      head: main.head + headDelta,
    },
    scrollIntoView: true,
  });
  view.focus();
}

function insertLink(view: EditorView): void {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to) || "link";
  const url = "https://";
  const content = `[${selected}](${url})`;
  const anchor = from + 1;
  const head = anchor + selected.length;

  replaceSelection(view, content, { anchor, head });
}

function runToolbarAction(view: EditorView, action: ToolbarAction): void {
  switch (action) {
    case "heading": {
      prefixCurrentLine(view, "# ");
      break;
    }
    case "bold": {
      wrapSelection(view, "**");
      break;
    }
    case "italic": {
      wrapSelection(view, "*");
      break;
    }
    case "code": {
      wrapSelection(view, "`");
      break;
    }
    case "link": {
      insertLink(view);
      break;
    }
    case "bullet": {
      prefixSelectedLines(view, "- ");
      break;
    }
    case "todo": {
      prefixSelectedLines(view, "- [ ] ");
      break;
    }
    case "quote": {
      prefixSelectedLines(view, "> ");
      break;
    }
  }
}

function MarkdownToolbar({
  portalContainer,
  readOnly,
  viewRef,
}: {
  portalContainer: HTMLElement | null;
  readOnly: boolean;
  viewRef: React.RefObject<EditorView | null>;
}) {
  if (!portalContainer || readOnly) {
    return null;
  }

  const toolbar = (
    <div className="bg-background/92 border-separator flex items-center gap-1 rounded-full border px-2 py-1.5 shadow-lg backdrop-blur">
      {TOOLBAR_BUTTONS.map((button) => (
        <Button
          className="text-muted-foreground hover:text-foreground h-8 rounded-full px-3 text-xs font-medium"
          key={button.key}
          onClick={(event: MouseEvent<HTMLButtonElement>) => {
            event.preventDefault();
            const view = viewRef.current;
            if (!view) {
              return;
            }
            runToolbarAction(view, button.key);
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          {button.label}
        </Button>
      ))}
    </div>
  );

  return createPortal(toolbar, portalContainer);
}

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(
  function NoteEditor(
    {
      focusMode,
      loadKey,
      markdown,
      onChange,
      onEditorFocusChange,
      onFocusHandled,
      onSearchMatchCountChange,
      readOnly,
      searchHighlightAllMatchesYellow,
      searchActiveMatchIndex,
      searchQuery,
      searchScrollRevision,
      spellCheck = false,
      toolbarContainer,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const onEditorFocusChangeRef = useRef(onEditorFocusChange);
    const onSearchMatchCountChangeRef = useRef(onSearchMatchCountChange);
    const editableCompartmentRef = useRef<Compartment | null>(null);
    const contentAttributesCompartmentRef = useRef<Compartment | null>(null);
    const applyingExternalChangeRef = useRef(false);
    const lastLoadKeyRef = useRef(loadKey);
    const prevPaneRef = useRef(useShellStore.getState().focusedPane);
    const initialMarkdownRef = useRef(markdown);
    const initialReadOnlyRef = useRef(readOnly);
    const initialSpellCheckRef = useRef(spellCheck);

    if (editableCompartmentRef.current === null) {
      editableCompartmentRef.current = new Compartment();
    }
    if (contentAttributesCompartmentRef.current === null) {
      contentAttributesCompartmentRef.current = new Compartment();
    }

    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
      onEditorFocusChangeRef.current = onEditorFocusChange;
    }, [onEditorFocusChange]);

    useEffect(() => {
      onSearchMatchCountChangeRef.current = onSearchMatchCountChange;
    }, [onSearchMatchCountChange]);

    useEffect(() => {
      if (!containerRef.current) {
        return;
      }

      const editableExtension = editableCompartmentRef.current!.of([
        EditorState.readOnly.of(initialReadOnlyRef.current),
        EditorView.editable.of(!initialReadOnlyRef.current),
      ]);
      const contentAttributesExtension =
        contentAttributesCompartmentRef.current!.of(
          EditorView.contentAttributes.of({
            autocapitalize: "off",
            autocorrect: "off",
            class: "comet-editor-content",
            spellcheck: initialSpellCheckRef.current ? "true" : "false",
          }),
        );

      const view = new EditorView({
        doc: initialMarkdownRef.current,
        extensions: [
          MARKDOWN_EDITOR_THEME,
          syntaxHighlighting(MARKDOWN_HIGHLIGHT_STYLE),
          history(),
          drawSelection(),
          highlightSpecialChars(),
          EditorView.lineWrapping,
          markdownLanguage(),
          search(),
          scrollCenterOnEnter(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          editableExtension,
          contentAttributesExtension,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              if (!applyingExternalChangeRef.current) {
                onChangeRef.current(update.state.doc.toString());
              }

              const query = getSearchQuery(update.state);
              onSearchMatchCountChangeRef.current?.(
                countSearchMatches(update.state, query),
              );
            }
          }),
          EditorView.domEventHandlers({
            focus: () => {
              onEditorFocusChangeRef.current?.(true);
            },
            blur: (event) => {
              const nextTarget = event.relatedTarget;
              if (
                nextTarget instanceof Node &&
                containerRef.current?.contains(nextTarget)
              ) {
                return;
              }

              onEditorFocusChangeRef.current?.(false);
            },
          }),
        ],
        parent: containerRef.current,
      });

      viewRef.current = view;
      onSearchMatchCountChangeRef.current?.(0);

      return () => {
        view.destroy();
        viewRef.current = null;
      };
    }, []);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) {
        return;
      }

      view.dispatch({
        effects: [
          editableCompartmentRef.current!.reconfigure([
            EditorState.readOnly.of(readOnly),
            EditorView.editable.of(!readOnly),
          ]),
          contentAttributesCompartmentRef.current!.reconfigure(
            EditorView.contentAttributes.of({
              autocapitalize: "off",
              autocorrect: "off",
              class: "comet-editor-content",
              spellcheck: spellCheck ? "true" : "false",
            }),
          ),
        ],
      });
    }, [readOnly, spellCheck]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) {
        return;
      }

      const nextMarkdown = markdown;
      const currentMarkdown = view.state.doc.toString();
      const isNewLoad = lastLoadKeyRef.current !== loadKey;
      if (!isNewLoad && currentMarkdown === nextMarkdown) {
        return;
      }

      applyingExternalChangeRef.current = true;
      const nextSelection = isNewLoad
        ? EditorSelection.cursor(0)
        : EditorSelection.cursor(
            Math.min(view.state.selection.main.head, nextMarkdown.length),
          );

      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: nextMarkdown,
        },
        selection: nextSelection,
        effects: isNewLoad
          ? EditorView.scrollIntoView(0, { y: "start" })
          : undefined,
      });
      applyingExternalChangeRef.current = false;
      lastLoadKeyRef.current = loadKey;
    }, [loadKey, markdown]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) {
        return;
      }

      const nextQuery = new CodeMirrorSearchQuery({ search: searchQuery });
      const currentQuery = getSearchQuery(view.state);
      if (!currentQuery.eq(nextQuery)) {
        view.dispatch({ effects: setSearchQuery.of(nextQuery) });
      }

      onSearchMatchCountChangeRef.current?.(
        countSearchMatches(view.state, nextQuery),
      );
    }, [searchQuery]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) {
        return;
      }

      if (searchActiveMatchIndex == null) {
        return;
      }

      const query = getSearchQuery(view.state);
      const match = findMatchAtIndex(view.state, query, searchActiveMatchIndex);
      if (!match) {
        return;
      }

      view.dispatch({
        selection: EditorSelection.range(match.from, match.to),
        effects: EditorView.scrollIntoView(match.from, { y: "center" }),
      });
    }, [searchActiveMatchIndex, searchQuery, searchScrollRevision]);

    useImperativeHandle(
      ref,
      () => ({
        blur() {
          viewRef.current?.contentDOM.blur();
        },
        focus() {
          if (readOnly) {
            return;
          }
          viewRef.current?.focus();
        },
        focusAtSurfacePoint(clientX: number, clientY: number) {
          const view = viewRef.current;
          if (!view || readOnly) {
            return false;
          }
          return focusEditorFromSurfacePoint(view, clientX, clientY);
        },
      }),
      [readOnly],
    );

    useEffect(() => {
      return useShellStore.subscribe((state) => {
        const previousPane = prevPaneRef.current;
        prevPaneRef.current = state.focusedPane;
        if (previousPane === "editor" && state.focusedPane !== "editor") {
          viewRef.current?.contentDOM.blur();
        }
      });
    }, []);

    useEffect(() => {
      if (readOnly || focusMode === "none") {
        return;
      }

      if (focusMode === "pointerup") {
        const handlePointerUp = () => {
          viewRef.current?.focus();
          onFocusHandled();
        };
        window.addEventListener("pointerup", handlePointerUp, { once: true });
        return () => {
          window.removeEventListener("pointerup", handlePointerUp);
        };
      }

      viewRef.current?.focus();
      onFocusHandled();
    }, [focusMode, onFocusHandled, readOnly]);

    return (
      <>
        <div
          className={cn(
            "comet-editor-shell relative flex min-h-full w-full flex-1",
            searchHighlightAllMatchesYellow &&
              "comet-codemirror-passive-search",
          )}
        >
          <div className="comet-editor-gutter" data-editor-gutter="left" />
          <div className="comet-editor-column">
            <div
              className="comet-codemirror-host min-h-full flex-1"
              ref={containerRef}
            />
          </div>
          <div className="comet-editor-gutter" data-editor-gutter="right" />
        </div>
        <MarkdownToolbar
          portalContainer={toolbarContainer}
          readOnly={readOnly}
          viewRef={viewRef}
        />
      </>
    );
  },
);
