import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type MouseEvent,
} from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown as markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { type SearchQuery, getSearchQuery, search } from "@codemirror/search";
import {
  Compartment,
  EditorSelection,
  EditorState,
  Transaction,
} from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightSpecialChars,
  keymap,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

import { useShellStore } from "@/features/shell/store/use-shell-store";
import { cn } from "@/shared/lib/utils";

type NoteEditorProps = {
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
  onChange(markdown: string): void;
};

export type NoteEditorHandle = {
  blur(): void;
  focus(): void;
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
    cursor: "text",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    minHeight: "100%",
    overflow: "visible",
    fontFamily: '"Figtree Variable", sans-serif',
    cursor: "text",
  },
  ".cm-content": {
    minHeight: "100%",
    color: "var(--editor-text)",
    caretColor: "var(--editor-caret)",
    cursor: "text",
  },
  ".cm-line": {
    padding: "0",
    cursor: "text",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--editor-caret)",
  },
  ".cm-selectionBackground": {
    backgroundColor: "color-mix(in oklab, var(--accent) 35%, transparent)",
  },
});

const DEBUG_EDITOR_FLOW = import.meta.env.DEV;

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

function placeCursorFromSurfacePoint(
  view: EditorView,
  clientX: number,
  clientY: number,
): boolean {
  const scrollContainer = view.dom.closest(
    "[data-editor-scroll-container]",
  ) as HTMLElement | null;
  const scrollTop = scrollContainer?.scrollTop ?? 0;
  const contentRect = view.contentDOM.getBoundingClientRect();
  if (clientY < contentRect.top || clientY > contentRect.bottom) {
    return false;
  }

  const targetX = Math.min(
    contentRect.right - 1,
    Math.max(contentRect.left + 1, clientX),
  );
  const pos = view.posAtCoords({ x: targetX, y: clientY }, false);

  view.dispatch({
    selection: EditorSelection.cursor(pos),
  });
  view.focus();

  if (scrollContainer) {
    scrollContainer.scrollTop = scrollTop;
  }

  return true;
}

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(
  function NoteEditor(
    {
      loadKey,
      markdown,
      onChange,
      onEditorFocusChange,
      onSearchMatchCountChange,
      readOnly,
      searchHighlightAllMatchesYellow,
      searchActiveMatchIndex,
      searchQuery,
      searchScrollRevision,
      spellCheck = false,
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
          EditorView.domEventHandlers({
            mousedown(event, view) {
              event.stopPropagation();

              if (!view.hasFocus) {
                event.preventDefault();
                return placeCursorFromSurfacePoint(
                  view,
                  event.clientX,
                  event.clientY,
                );
              }

              return false;
            },
          }),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          editableExtension,
          contentAttributesExtension,
          EditorView.updateListener.of((update) => {
            if (
              DEBUG_EDITOR_FLOW &&
              (update.selectionSet || update.docChanged)
            ) {
              console.debug("[editor:flow] updateListener", {
                docChanged: update.docChanged,
                head: update.state.selection.main.head,
                selectionSet: update.selectionSet,
                userEvents: update.transactions.map((transaction) =>
                  transaction.annotation(Transaction.userEvent),
                ),
              });
            }

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

      if (DEBUG_EDITOR_FLOW) {
        console.debug("[editor:flow] external markdown sync", {
          currentLength: currentMarkdown.length,
          isNewLoad,
          loadKey,
          nextLength: nextMarkdown.length,
        });
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

    return (
      <div
        className={cn(
          "comet-editor-shell relative flex min-h-full w-full flex-1",
          searchHighlightAllMatchesYellow && "comet-codemirror-passive-search",
        )}
      >
        <div
          className="comet-editor-gutter"
          data-editor-gutter="left"
          onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
            if (readOnly) {
              return;
            }

            const view = viewRef.current;
            if (!view) {
              return;
            }

            if (
              placeCursorFromSurfacePoint(view, event.clientX, event.clientY)
            ) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        />
        <div className="comet-editor-column">
          <div
            className="comet-codemirror-host min-h-full flex-1"
            ref={containerRef}
          />
        </div>
        <div
          className="comet-editor-gutter"
          data-editor-gutter="right"
          onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
            if (readOnly) {
              return;
            }

            const view = viewRef.current;
            if (!view) {
              return;
            }

            if (
              placeCursorFromSurfacePoint(view, event.clientX, event.clientY)
            ) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        />
      </div>
    );
  },
);
