import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type MouseEvent,
} from "react";
import {
  defaultKeymap,
  history,
  historyKeymap,
  redo,
  undo,
} from "@codemirror/commands";
import {
  markdown as markdownLanguage,
  markdownLanguage as markdownLang,
} from "@codemirror/lang-markdown";
import { Strikethrough, Table, TaskList } from "@lezer/markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { type SearchQuery, getSearchQuery, search } from "@codemirror/search";
import {
  Compartment,
  EditorSelection,
  EditorState,
  Transaction,
} from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightSpecialChars,
  keymap,
} from "@codemirror/view";
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
  redo(): boolean;
  undo(): boolean;
};

type GutterSide = "left" | "right";

const MARKDOWN_HIGHLIGHT_STYLE = HighlightStyle.define([
  { tag: [t.emphasis], fontStyle: "italic" },
  { tag: [t.strong], fontWeight: "700" },
  {
    tag: [t.monospace, t.literal],
    fontFamily:
      '"SF Mono", "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  { tag: [t.link, t.url], color: "var(--primary)" },
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
    borderLeftWidth: "1.5px",
    // marginTop: "-5px",
    // marginBottom: "-5px",
  },
  ".cm-selectionBackground": {
    backgroundColor: "color-mix(in oklab, var(--primary) 30%, transparent)",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "color-mix(in oklab, var(--primary) 30%, transparent)",
  },
  ".cm-selectionLayer": {
    zIndex: "1 !important",
    pointerEvents: "none",
  },
  "&.cm-focused .cm-content ::selection": {
    backgroundColor: "transparent !important",
  },
});

const HORIZONTAL_RULE_RE = /^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/u;
const LIST_PREFIX_RE = /^(\s*)([-*+]|\d+[.)]) (\[[ xX]\] )?/;
const TABLE_CELL_SELECTOR = ".cm-md-table-cell";
const TABLE_EDITOR_HOST_SELECTOR = ".cm-md-table-cell-editor";
const TABLE_WRAPPER_SELECTOR = ".cm-md-table-wrapper";
const TABLE_FROM_ATTR = "data-table-from";
const TABLE_TO_ATTR = "data-table-to";

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

function getListTextStartOffset(lineText: string): number {
  const match = LIST_PREFIX_RE.exec(lineText);
  return match ? match[0].length : 0;
}

function getListMarkerStartOffset(lineText: string): number {
  const match = LIST_PREFIX_RE.exec(lineText);
  return match ? (match[1]?.length ?? 0) : 0;
}

function getHorizontalRuleSelection(
  view: EditorView,
  target: EventTarget | null,
  clientX: number,
  clientY: number,
) {
  const targetElement =
    target instanceof HTMLElement
      ? target
      : document.elementFromPoint(clientX, clientY);
  const lineElement = targetElement?.closest(".cm-line");

  if (
    !(lineElement instanceof HTMLElement) ||
    !view.contentDOM.contains(lineElement)
  ) {
    return null;
  }

  const hrElement = lineElement.querySelector(".cm-md-hr");
  if (!(hrElement instanceof HTMLElement)) {
    return null;
  }

  const lineStart = view.posAtDOM(lineElement, 0);
  const line = view.state.doc.lineAt(lineStart);
  if (!HORIZONTAL_RULE_RE.test(line.text)) {
    return null;
  }

  const cursor = EditorSelection.cursor(line.to, -1);

  return EditorSelection.create([cursor]);
}

function getTargetElementAtPoint(
  target: EventTarget | null,
  clientX: number,
  clientY: number,
) {
  return target instanceof HTMLElement
    ? target
    : document.elementFromPoint(clientX, clientY);
}

function isInteractiveTableTarget(targetElement: HTMLElement | Element | null) {
  return Boolean(
    targetElement?.closest(
      `${TABLE_CELL_SELECTOR}, ${TABLE_EDITOR_HOST_SELECTOR}`,
    ),
  );
}

function findTableWrapperAtY(view: EditorView, clientY: number) {
  for (const candidate of view.contentDOM.querySelectorAll(
    TABLE_WRAPPER_SELECTOR,
  )) {
    if (!(candidate instanceof HTMLElement)) {
      continue;
    }

    const rect = candidate.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) {
      return candidate;
    }
  }

  return null;
}

function getTableSelectionSide(wrapperRect: DOMRect, clientX: number) {
  if (clientX <= wrapperRect.left) {
    return "before";
  }

  if (clientX >= wrapperRect.right) {
    return "after";
  }

  return clientX <= wrapperRect.left + wrapperRect.width / 2
    ? "before"
    : "after";
}

function getTableBoundarySelectionFromWrapper(
  wrapper: HTMLElement,
  selectionSide: "after" | "before",
) {
  const tableFrom = Number.parseInt(
    wrapper.getAttribute(TABLE_FROM_ATTR) ?? "",
    10,
  );
  const tableTo = Number.parseInt(
    wrapper.getAttribute(TABLE_TO_ATTR) ?? "",
    10,
  );
  if (!Number.isFinite(tableFrom) || !Number.isFinite(tableTo)) {
    return null;
  }

  return EditorSelection.create([
    EditorSelection.cursor(
      selectionSide === "before" ? tableFrom : tableTo,
      selectionSide === "before" ? 1 : -1,
    ),
  ]);
}

function getTableBoundarySelection(
  view: EditorView,
  target: EventTarget | null,
  clientX: number,
  clientY: number,
  allowInteractiveTableTarget = false,
) {
  const targetElement = getTargetElementAtPoint(target, clientX, clientY);
  if (!allowInteractiveTableTarget && isInteractiveTableTarget(targetElement)) {
    return null;
  }

  const wrapperFromTarget = targetElement?.closest(TABLE_WRAPPER_SELECTOR);
  let wrapper =
    wrapperFromTarget instanceof HTMLElement &&
    view.contentDOM.contains(wrapperFromTarget)
      ? wrapperFromTarget
      : null;

  if (!wrapper) {
    wrapper = findTableWrapperAtY(view, clientY);
  }

  if (!wrapper) {
    return null;
  }

  const wrapperRect = wrapper.getBoundingClientRect();
  const selectionSide = getTableSelectionSide(wrapperRect, clientX);

  return getTableBoundarySelectionFromWrapper(wrapper, selectionSide);
}

function getGutterTableBoundarySelection(
  view: EditorView,
  clientY: number,
  side: GutterSide,
) {
  const wrapper = findTableWrapperAtY(view, clientY);
  if (!wrapper) {
    return null;
  }

  return getTableBoundarySelectionFromWrapper(
    wrapper,
    side === "left" ? "before" : "after",
  );
}

function getLineBoundaryCursor(
  view: EditorView,
  clientY: number,
  side: GutterSide,
) {
  const contentRect = view.contentDOM.getBoundingClientRect();
  if (clientY < contentRect.top || clientY > contentRect.bottom) {
    return null;
  }

  const targetY = Math.min(
    contentRect.bottom - 1,
    Math.max(contentRect.top + 1, clientY),
  );
  const tableBoundarySelection = getGutterTableBoundarySelection(
    view,
    targetY,
    side,
  );
  if (tableBoundarySelection) {
    return tableBoundarySelection.main;
  }

  const probeInset = Math.max(view.defaultCharacterWidth * 4, 8);
  const probeX =
    side === "left"
      ? Math.min(contentRect.left + probeInset, contentRect.right - 1)
      : Math.max(contentRect.right - probeInset, contentRect.left + 1);
  const anchor = view.posAndSideAtCoords({ x: probeX, y: targetY }, false);

  if (anchor == null) {
    return null;
  }

  const line = view.state.doc.lineAt(anchor.pos);
  if (side === "left") {
    return EditorSelection.cursor(
      line.from + getListMarkerStartOffset(line.text),
      1,
    );
  }

  const contentFrom = Math.min(
    line.to,
    line.from + getListTextStartOffset(line.text),
  );

  return findVisualFragmentBoundary(view, contentFrom, line.to, targetY, side);
}

function getSelectionHeadFromPoint(
  view: EditorView,
  target: EventTarget | null,
  clientX: number,
  clientY: number,
  side: GutterSide,
) {
  const contentRect = view.contentDOM.getBoundingClientRect();
  if (clientY < contentRect.top || clientY > contentRect.bottom) {
    return null;
  }

  if (clientX <= contentRect.left || clientX >= contentRect.right) {
    return getLineBoundaryCursor(view, clientY, side);
  }

  const tableBoundarySelection = getTableBoundarySelection(
    view,
    target,
    clientX,
    clientY,
    true,
  );
  if (tableBoundarySelection) {
    return tableBoundarySelection.main;
  }

  const pos = view.posAtCoords(
    {
      x: clientX,
      y: clientY,
    },
    false,
  );
  if (pos == null) {
    return null;
  }

  return EditorSelection.cursor(pos);
}

function isRectOnClickedRow(
  rect: { top: number; bottom: number },
  clientY: number,
): boolean {
  return clientY >= rect.top && clientY <= rect.bottom;
}

function findVisualFragmentBoundary(
  view: EditorView,
  lineFrom: number,
  lineTo: number,
  clientY: number,
  side: "left" | "right",
) {
  if (side === "left") {
    for (let position = lineFrom; position <= lineTo; position += 1) {
      const rect =
        view.coordsAtPos(position, 1) ?? view.coordsAtPos(position, -1);
      if (rect && isRectOnClickedRow(rect, clientY)) {
        return EditorSelection.cursor(position, 1);
      }
    }
    return EditorSelection.cursor(lineFrom, 1);
  }

  for (let position = lineTo; position >= lineFrom; position -= 1) {
    const rect =
      view.coordsAtPos(position, -1) ?? view.coordsAtPos(position, 1);
    if (rect && isRectOnClickedRow(rect, clientY)) {
      return EditorSelection.cursor(position, -1);
    }
  }

  return EditorSelection.cursor(lineTo, -1);
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
    const gutterDragCleanupRef = useRef<(() => void) | null>(null);
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
          drawSelection(),
          EditorView.lineWrapping,
          markdownLanguage({
            base: markdownLang,
            extensions: [
              Strikethrough,
              Table,
              TaskList,
              HighlightSyntax,
              TagGrammar,
            ],
          }),
          inlineImages(),
          markdownDecorations(),
          tagHighlightStyle,
          search(),
          EditorView.domEventHandlers({
            mousedown(event, view) {
              if (!view.hasFocus) {
                useShellStore.getState().setFocusedPane("editor");
                view.contentDOM.focus({ preventScroll: true });
              }

              const horizontalRuleSelection = getHorizontalRuleSelection(
                view,
                event.target,
                event.clientX,
                event.clientY,
              );
              if (horizontalRuleSelection) {
                event.preventDefault();
                event.stopPropagation();
                view.focus();
                view.dispatch({ selection: horizontalRuleSelection });
                return true;
              }

              const tableBoundarySelection = getTableBoundarySelection(
                view,
                event.target,
                event.clientX,
                event.clientY,
              );
              if (tableBoundarySelection) {
                event.preventDefault();
                event.stopPropagation();
                view.focus();
                view.dispatch({
                  scrollIntoView: false,
                  selection: tableBoundarySelection,
                });
                return true;
              }

              event.stopPropagation();

              if (!view.hasFocus) {
                event.preventDefault();

                const scrollContainer = view.dom.closest(
                  "[data-editor-scroll-container]",
                ) as HTMLElement | null;
                const scrollTop = scrollContainer?.scrollTop ?? 0;
                const clickedInsideTable =
                  event.target instanceof HTMLElement &&
                  event.target.closest(".cm-md-table-wrapper");

                view.focus();

                if (scrollContainer) {
                  lockScrollPosition(scrollContainer, scrollTop);
                }

                if (clickedInsideTable) {
                  return false;
                }

                const pos = view.posAtCoords(
                  {
                    x: event.clientX,
                    y: event.clientY,
                  },
                  false,
                );
                if (pos != null) {
                  view.dispatch({
                    selection: EditorSelection.cursor(pos),
                    scrollIntoView: false,
                  });
                }

                return true;
              }

              return false;
            },
          }),
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

      if (isNewLoad) {
        // Replace content and exclude from undo history so the user
        // cannot undo past the newly loaded note.
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: nextMarkdown,
          },
          annotations: Transaction.addToHistory.of(false),
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
        redo() {
          return viewRef.current ? redo(viewRef.current) : false;
        },
        undo() {
          return viewRef.current ? undo(viewRef.current) : false;
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
      return () => {
        gutterDragCleanupRef.current?.();
        gutterDragCleanupRef.current = null;
      };
    }, []);

    const startGutterSelectionDrag = (
      event: MouseEvent<HTMLDivElement>,
      side: GutterSide,
    ) => {
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

      const anchor = getLineBoundaryCursor(view, event.clientY, side);
      if (!anchor) {
        return;
      }

      const scrollContainer = view.dom.closest(
        "[data-editor-scroll-container]",
      ) as HTMLElement | null;
      const scrollTop = scrollContainer?.scrollTop ?? 0;

      view.focus();
      if (scrollContainer) {
        lockScrollPosition(scrollContainer, scrollTop);
      }

      view.dispatch({
        selection: EditorSelection.create([anchor]),
      });

      gutterDragCleanupRef.current?.();

      const ownerDocument = view.dom.ownerDocument;
      const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
        if ((moveEvent.buttons & 1) === 0) {
          cleanup();
          return;
        }

        moveEvent.preventDefault();
        const head = getSelectionHeadFromPoint(
          view,
          moveEvent.target,
          moveEvent.clientX,
          moveEvent.clientY,
          side,
        );
        if (!head) {
          return;
        }

        view.dispatch({
          scrollIntoView: false,
          selection: EditorSelection.create([
            EditorSelection.range(anchor.anchor, head.head),
          ]),
        });
      };
      const handleMouseUp = (upEvent: globalThis.MouseEvent) => {
        upEvent.preventDefault();
        cleanup();
        view.focus();
      };
      const cleanup = () => {
        ownerDocument.removeEventListener("mousemove", handleMouseMove, true);
        ownerDocument.removeEventListener("mouseup", handleMouseUp, true);
        if (gutterDragCleanupRef.current === cleanup) {
          gutterDragCleanupRef.current = null;
        }
      };

      ownerDocument.addEventListener("mousemove", handleMouseMove, true);
      ownerDocument.addEventListener("mouseup", handleMouseUp, true);
      gutterDragCleanupRef.current = cleanup;
    };

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
            startGutterSelectionDrag(event, "left");
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
            startGutterSelectionDrag(event, "right");
          }}
        />
      </div>
    );
  },
);
