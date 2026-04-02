import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type MouseEvent,
} from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  markdown as markdownLanguage,
  markdownLanguage as markdownLang,
} from "@codemirror/lang-markdown";
import { Strikethrough, TaskList } from "@lezer/markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { type SearchQuery, getSearchQuery, search } from "@codemirror/search";
import {
  Compartment,
  EditorSelection,
  EditorState,
  Transaction,
} from "@codemirror/state";
import { EditorView, highlightSpecialChars, keymap } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

import { inlineImages } from "@/features/editor/extensions/inline-images";
import {
  HighlightSyntax,
  markdownDecorations,
} from "@/features/editor/extensions/markdown-decorations";
import {
  TagGrammar,
  tagHighlightStyle,
} from "@/features/editor/extensions/markdown-decorations/tag-syntax";
import { useShellStore } from "@/features/shell/store/use-shell-store";
import { cn } from "@/shared/lib/utils";

type NoteEditorProps = {
  autoFocus?: boolean;
  loadKey: string;
  markdown: string;
  onAutoFocusHandled?(): void;
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
  { tag: [t.comment], color: "var(--syntax-comment)" },
  { tag: [t.processingInstruction], color: "var(--muted-foreground)" },
  { tag: [t.contentSeparator], color: "var(--muted-foreground)" },
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
    paddingBlock: "0",
    paddingRight: "2px",
    cursor: "text",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--editor-caret)",
  },
  ".cm-selectionBackground": {
    backgroundColor: "color-mix(in oklab, var(--primary) 30%, transparent)",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "color-mix(in oklab, var(--primary) 30%, transparent)",
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

function lockScrollPosition(scrollContainer: HTMLElement, scrollTop: number) {
  scrollContainer.scrollTop = scrollTop;
  const lock = () => {
    scrollContainer.scrollTop = scrollTop;
  };
  scrollContainer.addEventListener("scroll", lock);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollContainer.removeEventListener("scroll", lock);
    });
  });
}

function focusAtLineBoundary(
  view: EditorView,
  clientY: number,
  side: "left" | "right",
): boolean {
  const contentRect = view.contentDOM.getBoundingClientRect();
  if (clientY < contentRect.top || clientY > contentRect.bottom) {
    return false;
  }

  const scrollContainer = view.dom.closest(
    "[data-editor-scroll-container]",
  ) as HTMLElement | null;
  const scrollTop = scrollContainer?.scrollTop ?? 0;

  if (!view.hasFocus) {
    view.focus();
  }

  if (scrollContainer) {
    lockScrollPosition(scrollContainer, scrollTop);
  }

  const targetY = Math.min(
    contentRect.bottom - 1,
    Math.max(contentRect.top + 1, clientY),
  );
  const probeInset = Math.max(view.defaultCharacterWidth * 4, 8);
  const probeX =
    side === "left"
      ? Math.min(contentRect.left + probeInset, contentRect.right - 1)
      : Math.max(contentRect.right - probeInset, contentRect.left + 1);
  const anchor = view.posAndSideAtCoords({ x: probeX, y: targetY }, false);

  if (anchor == null) {
    return false;
  }

  const boundary = view.moveToLineBoundary(
    EditorSelection.cursor(anchor.pos, anchor.assoc),
    side === "right",
    true,
  );

  view.dispatch({
    selection: EditorSelection.create([boundary]),
  });

  requestAnimationFrame(() => {
    view.focus();
  });

  return true;
}

function blurEditorView(view: EditorView) {
  const activeElement = document.activeElement;
  if (
    activeElement instanceof HTMLElement &&
    view.dom.contains(activeElement)
  ) {
    activeElement.blur();
  }

  view.contentDOM.blur();
}

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(
  function NoteEditor(
    {
      autoFocus = false,
      loadKey,
      markdown,
      onChange,
      onAutoFocusHandled,
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
          highlightSpecialChars(),
          EditorView.lineWrapping,
          markdownLanguage({
            base: markdownLang,
            extensions: [Strikethrough, TaskList, HighlightSyntax, TagGrammar],
          }),
          inlineImages(),
          markdownDecorations(),
          tagHighlightStyle,
          search(),
          EditorView.domEventHandlers({
            mousedown(event, view) {
              event.stopPropagation();

              if (!view.hasFocus) {
                event.preventDefault();

                const scrollContainer = view.dom.closest(
                  "[data-editor-scroll-container]",
                ) as HTMLElement | null;
                const scrollTop = scrollContainer?.scrollTop ?? 0;

                view.focus();

                if (scrollContainer) {
                  lockScrollPosition(scrollContainer, scrollTop);
                }

                // Re-dispatch so CM's native mousedown handles cursor
                // placement (hasFocus is now true, so our guard skips it)
                view.contentDOM.dispatchEvent(
                  new MouseEvent("mousedown", {
                    clientX: event.clientX,
                    clientY: event.clientY,
                    button: event.button,
                    buttons: event.buttons,
                    detail: event.detail,
                    bubbles: true,
                    cancelable: true,
                  }),
                );

                return true;
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

      if (isNewLoad) {
        // Replace content without setting selection — avoids WebKit
        // focusing the contenteditable when the DOM selection is updated
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: nextMarkdown,
          },
        });

        if (autoFocus) {
          view.focus();
          onAutoFocusHandled?.();
        } else {
          blurEditorView(view);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (useShellStore.getState().focusedPane !== "editor") {
                blurEditorView(view);
              }
            });
          });
        }
      } else {
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: nextMarkdown,
          },
          selection: EditorSelection.cursor(
            Math.min(view.state.selection.main.head, nextMarkdown.length),
          ),
        });
      }

      applyingExternalChangeRef.current = false;
      lastLoadKeyRef.current = loadKey;
    }, [autoFocus, loadKey, markdown, onAutoFocusHandled]);

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
          onClick={(event: MouseEvent<HTMLDivElement>) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onMouseUp={(event: MouseEvent<HTMLDivElement>) => {
            event.preventDefault();
            event.stopPropagation();
            viewRef.current?.focus();
          }}
          onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
            if (readOnly) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            useShellStore.getState().setFocusedPane("editor");

            const view = viewRef.current;
            if (!view) {
              return;
            }

            focusAtLineBoundary(view, event.clientY, "left");
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
          onClick={(event: MouseEvent<HTMLDivElement>) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onMouseUp={(event: MouseEvent<HTMLDivElement>) => {
            event.preventDefault();
            event.stopPropagation();
            viewRef.current?.focus();
          }}
          onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
            if (readOnly) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            useShellStore.getState().setFocusedPane("editor");

            const view = viewRef.current;
            if (!view) {
              return;
            }

            focusAtLineBoundary(view, event.clientY, "right");
          }}
        />
      </div>
    );
  },
);
