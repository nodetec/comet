import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  defaultKeymap,
  history,
  historyKeymap,
  redo,
  selectAll,
  undo,
} from "@codemirror/commands";
import {
  markdown as markdownLanguage,
  markdownKeymap,
  markdownLanguage as markdownLang,
} from "@codemirror/lang-markdown";
import { Strikethrough, Table, TaskList } from "@lezer/markdown";
import { syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { getSearchQuery, search } from "@codemirror/search";
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
import { vim } from "@replit/codemirror-vim";

import {
  AUTOCOMPLETE_MENU_THEME,
  buildSearchAwarePresentationExtensions,
  DISABLE_SETEXT_HEADING,
  MARKDOWN_EDITOR_THEME,
  MARKDOWN_HIGHLIGHT_STYLE,
} from "@/features/editor/lib/note-editor-config";
import { countSearchMatches } from "@/features/editor/lib/note-editor-search";
import {
  DEFAULT_TOOLBAR_STATE,
  getToolbarState,
} from "@/features/editor/lib/toolbar-state";
import {
  createEditorContentAttributes,
  findEditorScrollContainer,
  getEditorScrollContainer,
  lockEditorScrollPosition,
} from "@/features/editor/lib/view-utils";
import { ensureNoteEditorVimNavigation } from "@/features/editor/lib/note-editor-vim";
import { EditorToolbar } from "@/features/editor/ui/editor-toolbar";
import { HighlightSyntax } from "@/features/editor/extensions/markdown-decorations";
import { getInlineSyntaxRightBoundaryAtCursor } from "@/features/editor/extensions/markdown-decorations/builders/inline-boundaries";
import {
  TagGrammar,
  tagHighlightStyle,
} from "@/features/editor/extensions/markdown-decorations/tag-syntax";
import {
  WikiLinkGrammar,
  wikilinkHighlightStyle,
} from "@/features/editor/extensions/markdown-decorations/wikilink-syntax";
import { noteAutocomplete } from "@/features/editor/extensions/note-autocomplete";
import { dropImage } from "@/features/editor/extensions/drop-image";
import { pasteImage } from "@/features/editor/extensions/paste-image";
import { pasteLink } from "@/features/editor/extensions/paste-link";
import { scrollCenterOnEnter } from "@/features/editor/extensions/scroll-center-on-enter";
import { scrollPastEnd } from "@/features/editor/extensions/scroll-past-end";
import { deleteTableBackward } from "@/features/editor/extensions/tables/delete-table-boundary";
import {
  getHorizontalRuleSelection,
  getTableBoundarySelection,
} from "@/features/editor/lib/note-editor-selection";
import { useNoteEditorSearchSync } from "@/features/editor/hooks/use-note-editor-search-sync";
import { useNoteEditorToolbarActions } from "@/features/editor/hooks/use-note-editor-toolbar-actions";
import { uiStore } from "@/features/settings/store/use-ui-store";
import { useShellNavigationStore } from "@/shared/stores/use-shell-navigation-store";
import {
  isEditorFindShortcut,
  isNotesSearchShortcut,
} from "@/shared/lib/keyboard";
import { cn } from "@/shared/lib/utils";

type NoteEditorProps = {
  availableTagPaths: string[];
  autoFocus?: boolean;
  loadKey: string;
  markdown: string;
  noteId: string | null;
  onAutoFocusHandled?(): void;
  onEditorFocusChange?(focused: boolean): void;
  onSearchMatchCountChange?(count: number): void;
  readOnly: boolean;
  searchHighlightAllMatchesYellow?: boolean;
  searchActiveMatchIndex?: number | null;
  searchQuery: string;
  searchScrollRevision?: number;
  spellCheck?: boolean;
  toolbarContainer?: HTMLElement | null;
  vimMode?: boolean;
  onChange(markdown: string): void;
};

export type NoteEditorHandle = {
  blur(): void;
  focus(): void;
  focusAtStart(): void;
  focusAtEnd(): void;
  redo(): boolean;
  undo(): boolean;
};

ensureNoteEditorVimNavigation();

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

function syncEditorPaneFocusState(view: EditorView, focusedPane: string) {
  view.dom.classList.toggle("comet-editor-inactive", focusedPane !== "editor");
}

function trySnapInlineSyntaxRightBoundaryClick(
  view: EditorView,
  event: globalThis.MouseEvent,
) {
  if (event.button !== 0 || event.shiftKey) {
    return false;
  }

  const contentRect = view.contentDOM.getBoundingClientRect();
  if (event.clientX < contentRect.left || event.clientX > contentRect.right) {
    return false;
  }

  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }, false);
  if (pos == null) {
    return false;
  }

  const inlineSyntaxRightBoundary = getInlineSyntaxRightBoundaryAtCursor(
    view.state,
    pos,
  );
  if (inlineSyntaxRightBoundary == null) {
    return false;
  }

  const contentEndRect =
    view.coordsAtPos(inlineSyntaxRightBoundary.contentEnd, -1) ??
    view.coordsAtPos(inlineSyntaxRightBoundary.contentEnd, 1);
  if (!contentEndRect) {
    return false;
  }

  const contentRightEdge = Math.max(contentEndRect.left, contentEndRect.right);
  if (event.clientX <= contentRightEdge) {
    return false;
  }

  event.preventDefault();
  view.dispatch({
    selection: EditorSelection.cursor(inlineSyntaxRightBoundary.syntaxEnd),
    scrollIntoView: false,
  });
  view.focus();
  return true;
}

function isExcludedLeadingClickTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        [
          ".cm-md-task-marker-box",
          ".cm-md-task-marker-source",
          ".cm-md-table-wrapper",
          ".cm-md-table-cell",
          ".cm-md-table-cell-editor",
          ".cm-md-link",
          ".cm-md-hr",
        ].join(", "),
      ),
    )
  );
}

function getLeadingPaddingClickLineStart(
  view: EditorView,
  event: Pick<MouseEvent, "clientX" | "clientY" | "target">,
) {
  if (isExcludedLeadingClickTarget(event.target)) {
    return null;
  }

  const pos = view.posAtCoords(
    {
      x: event.clientX,
      y: event.clientY,
    },
    false,
  );
  if (pos == null) {
    return null;
  }

  const line = view.state.doc.lineAt(pos);
  const clickedBlock = view.lineBlockAtHeight(event.clientY - view.documentTop);
  if (clickedBlock.from !== line.from) {
    return null;
  }

  const startRect =
    view.coordsAtPos(line.from, 1) ?? view.coordsAtPos(line.from, -1);
  if (!startRect) {
    return null;
  }

  const firstVisualLineTop = Math.min(startRect.top, startRect.bottom);
  const firstVisualLineBottom = Math.max(startRect.top, startRect.bottom);
  if (
    event.clientY < firstVisualLineTop ||
    event.clientY > firstVisualLineBottom
  ) {
    return null;
  }

  return event.clientX < Math.min(startRect.left, startRect.right)
    ? line.from
    : null;
}

function focusEditorPreservingScroll(view: EditorView) {
  const scrollContainer = findEditorScrollContainer(view);
  const scrollTop = scrollContainer?.scrollTop ?? 0;

  useShellNavigationStore.getState().actions.setFocusedPane("editor");
  view.focus();

  if (scrollContainer) {
    lockEditorScrollPosition(scrollContainer, scrollTop);
  }
}

function focusEditorAtEndPreservingScroll(view: EditorView) {
  const scrollContainer = findEditorScrollContainer(view);
  const scrollTop = scrollContainer?.scrollTop ?? 0;

  useShellNavigationStore.getState().actions.setFocusedPane("editor");
  view.dispatch({
    selection: EditorSelection.cursor(view.state.doc.length),
    scrollIntoView: false,
  });
  view.focus();

  if (scrollContainer) {
    lockEditorScrollPosition(scrollContainer, scrollTop);
  }
}

function focusEditorAtStart(view: EditorView) {
  useShellNavigationStore.getState().actions.setFocusedPane("editor");
  view.focus();
  view.dispatch({
    selection: EditorSelection.cursor(0),
    scrollIntoView: true,
  });
}

function dispatchPointerCursorSelection(view: EditorView, pos: number) {
  view.dispatch({
    annotations: Transaction.userEvent.of("select.pointer"),
    selection: EditorSelection.cursor(pos),
    scrollIntoView: false,
  });
}

function handleSpecialMouseDownSelection(view: EditorView, event: MouseEvent) {
  if (trySnapInlineSyntaxRightBoundaryClick(view, event)) {
    return true;
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
    useShellNavigationStore.getState().actions.setFocusedPane("editor");
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
    useShellNavigationStore.getState().actions.setFocusedPane("editor");
    view.focus();
    view.dispatch({
      scrollIntoView: false,
      selection: tableBoundarySelection,
    });
    return true;
  }

  return false;
}

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(
  function NoteEditor(
    {
      availableTagPaths,
      autoFocus = false,
      loadKey,
      markdown,
      noteId,
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
      toolbarContainer = null,
      vimMode = false,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const onEditorFocusChangeRef = useRef(onEditorFocusChange);
    const onSearchMatchCountChangeRef = useRef(onSearchMatchCountChange);
    const initialAvailableTagPathsRef = useRef(availableTagPaths);
    const editableCompartmentRef = useRef(new Compartment());
    const autocompleteCompartmentRef = useRef(new Compartment());
    const contentAttributesCompartmentRef = useRef(new Compartment());
    const presentationCompartmentRef = useRef(new Compartment());
    const vimCompartmentRef = useRef(new Compartment());
    const applyingExternalChangeRef = useRef(false);
    const lastLoadKeyRef = useRef(loadKey);
    const prevPaneRef = useRef(useShellNavigationStore.getState().focusedPane);
    const initialAutoFocusRef = useRef(autoFocus);
    const initialOnAutoFocusHandledRef = useRef(onAutoFocusHandled);
    const initialMarkdownRef = useRef(markdown);
    const initialNoteIdRef = useRef(noteId);
    const initialReadOnlyRef = useRef(readOnly);
    const initialSearchQueryRef = useRef(searchQuery);
    const initialSpellCheckRef = useRef(spellCheck);
    const initialVimModeRef = useRef(vimMode);
    const selectAllCursorRef = useRef<number | null>(null);
    const [toolbarState, setToolbarState] = useState(DEFAULT_TOOLBAR_STATE);
    onChangeRef.current = onChange;
    onEditorFocusChangeRef.current = onEditorFocusChange;
    onSearchMatchCountChangeRef.current = onSearchMatchCountChange;

    const {
      handleCycleBlockType,
      handleInsertCodeBlock,
      handleInsertImage,
      handleInsertTable,
      handleToggleInlineFormat,
    } = useNoteEditorToolbarActions({
      readOnly,
      viewRef,
    });

    useNoteEditorSearchSync({
      loadKey,
      markdown,
      noteId,
      onSearchMatchCountChangeRef,
      presentationCompartmentRef,
      searchActiveMatchIndex,
      searchHighlightAllMatchesYellow,
      searchQuery,
      searchScrollRevision,
      viewRef,
    });

    useEffect(() => {
      if (!containerRef.current) {
        return;
      }

      const editableExtension = editableCompartmentRef.current.of([
        EditorState.readOnly.of(initialReadOnlyRef.current),
        EditorView.editable.of(!initialReadOnlyRef.current),
      ]);
      const autocompleteExtension = autocompleteCompartmentRef.current.of(
        noteAutocomplete(
          initialNoteIdRef.current,
          initialAvailableTagPathsRef.current,
        ),
      );
      const contentAttributesExtension =
        contentAttributesCompartmentRef.current.of(
          createEditorContentAttributes(initialSpellCheckRef.current),
        );
      const presentationExtension = presentationCompartmentRef.current.of(
        buildSearchAwarePresentationExtensions(
          initialSearchQueryRef.current,
          initialNoteIdRef.current,
        ),
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
          scrollCenterOnEnter({ viewportPercentage: 5 }),
          scrollPastEnd(),
          markdownLanguage({
            base: markdownLang,
            extensions: [
              Strikethrough,
              Table,
              TaskList,
              HighlightSyntax,
              TagGrammar,
              WikiLinkGrammar,
              DISABLE_SETEXT_HEADING,
            ],
            codeLanguages: languages,
          }),
          autocompleteExtension,
          AUTOCOMPLETE_MENU_THEME,
          presentationExtension,
          tagHighlightStyle,
          wikilinkHighlightStyle,
          pasteImage(),
          dropImage(),
          pasteLink(),
          search(),
          EditorView.domEventHandlers({
            mousedown(event, view) {
              if (handleSpecialMouseDownSelection(view, event)) {
                return true;
              }

              event.stopPropagation();

              if (!view.hasFocus) {
                focusEditorPreservingScroll(view);
              }

              return false;
            },
            click(event, view) {
              // Bail for any non-trivial selection (real drags).
              // Small selections from slight mouse movement (< 4 chars)
              // are treated as clicks and corrected. The list normalization
              // filter also collapses accidental small selections in the
              // marker area.
              const sel = view.state.selection.main;
              if (!sel.empty && sel.to - sel.from > 3) {
                return false;
              }

              const lineStart = getLeadingPaddingClickLineStart(view, event);
              if (lineStart == null) {
                return false;
              }

              event.preventDefault();
              event.stopPropagation();

              focusEditorPreservingScroll(view);
              dispatchPointerCursorSelection(view, lineStart);
              return true;
            },
          }),
          EditorView.domEventHandlers({
            keydown(event, view) {
              if (event.defaultPrevented) {
                return false;
              }

              if (isNotesSearchShortcut(event)) {
                return false;
              }

              if (isEditorFindShortcut(event)) {
                return true;
              }
              if (event.ctrlKey && !event.metaKey && event.key === "k") {
                event.preventDefault();
                const el = getEditorScrollContainer(view);
                const pageHeight = el.clientHeight;
                el.scrollBy({ top: -pageHeight, behavior: "smooth" });
                const targetTop = Math.max(0, el.scrollTop - pageHeight);
                const pos = view.lineBlockAtHeight(
                  targetTop - view.documentTop,
                ).from;
                view.dispatch({ selection: EditorSelection.cursor(pos) });
                return true;
              }
              return false;
            },
          }),
          keymap.of([
            {
              key: "Backspace",
              run: deleteTableBackward,
            },
            {
              key: "Escape",
              run(view) {
                const { main } = view.state.selection;
                const savedCursor = selectAllCursorRef.current;
                const isFullDocumentSelection =
                  !main.empty &&
                  main.from === 0 &&
                  main.to === view.state.doc.length;

                if (!isFullDocumentSelection || savedCursor == null) {
                  return false;
                }

                selectAllCursorRef.current = null;
                view.dispatch({
                  selection: EditorSelection.cursor(
                    Math.min(savedCursor, view.state.doc.length),
                  ),
                  scrollIntoView: false,
                });
                return true;
              },
            },
            {
              key: "Escape",
              run(view) {
                const uiState = uiStore.getState();
                if (!uiState.notesPanelVisible) {
                  uiState.actions.toggleFocusMode();
                }
                useShellNavigationStore
                  .getState()
                  .actions.setFocusedPane("notes");
                blurEditorView(view);
                return true;
              },
            },
            {
              key: "Mod-a",
              run(view) {
                selectAllCursorRef.current = view.state.selection.main.head;
                return selectAll(view);
              },
            },
            ...markdownKeymap,
            ...defaultKeymap.filter(
              (b) => b.key !== "Ctrl-k" && b.mac !== "Ctrl-k",
            ),
            ...historyKeymap,
          ]),
          vimCompartmentRef.current.of(initialVimModeRef.current ? vim() : []),
          editableExtension,
          contentAttributesExtension,
          EditorView.updateListener.of((update) => {
            let markdown: string | null = null;
            const getMarkdown = () =>
              (markdown ??= update.state.doc.toString());

            if (update.docChanged && !applyingExternalChangeRef.current) {
              // Defer the onChange callback so the Zustand store update
              // (and the React re-render it triggers) doesn't block the
              // current keystroke from painting.
              const md = getMarkdown();
              setTimeout(() => onChangeRef.current(md), 0);
            }

            if (
              !update.docChanged &&
              update.selectionSet &&
              update.state.selection.main.empty
            ) {
              selectAllCursorRef.current = null;
            }

            if (update.docChanged) {
              const query = getSearchQuery(update.state);
              if (query.valid) {
                onSearchMatchCountChangeRef.current?.(
                  countSearchMatches(update.state, query),
                );
              } else {
                onSearchMatchCountChangeRef.current?.(0);
              }
            }

            if (update.docChanged || update.selectionSet) {
              setToolbarState(
                getToolbarState(getMarkdown(), {
                  anchor: update.state.selection.main.anchor,
                  head: update.state.selection.main.head,
                }),
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
      setToolbarState(
        getToolbarState(view.state.doc.toString(), {
          anchor: view.state.selection.main.anchor,
          head: view.state.selection.main.head,
        }),
      );

      syncEditorPaneFocusState(view, prevPaneRef.current);
      const unsubscribeShell = useShellNavigationStore.subscribe((state) => {
        prevPaneRef.current = state.focusedPane;
        syncEditorPaneFocusState(view, state.focusedPane);
      });

      if (initialAutoFocusRef.current) {
        view.dispatch({
          selection: EditorSelection.cursor(view.state.doc.length),
        });
        view.focus();
        initialOnAutoFocusHandledRef.current?.();
      }

      return () => {
        unsubscribeShell();
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
          editableCompartmentRef.current.reconfigure([
            EditorState.readOnly.of(readOnly),
            EditorView.editable.of(!readOnly),
          ]),
          contentAttributesCompartmentRef.current.reconfigure(
            createEditorContentAttributes(spellCheck),
          ),
        ],
      });
    }, [readOnly, spellCheck]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) {
        return;
      }

      view.dispatch({
        effects: autocompleteCompartmentRef.current.reconfigure(
          noteAutocomplete(noteId, availableTagPaths),
        ),
      });
    }, [availableTagPaths, noteId]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) {
        return;
      }
      view.dispatch({
        effects: vimCompartmentRef.current.reconfigure(vimMode ? vim() : []),
      });
    }, [vimMode]);

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
          ...(autoFocus && {
            selection: EditorSelection.cursor(nextMarkdown.length),
          }),
          annotations: Transaction.addToHistory.of(false),
        });

        if (autoFocus) {
          useShellNavigationStore.getState().actions.setFocusedPane("editor");
          view.focus();
          onAutoFocusHandled?.();
        } else {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (useShellNavigationStore.getState().focusedPane !== "editor") {
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
        focusAtStart() {
          if (readOnly || !viewRef.current) {
            return;
          }

          focusEditorAtStart(viewRef.current);
        },
        focusAtEnd() {
          if (readOnly || !viewRef.current) {
            return;
          }

          focusEditorAtEndPreservingScroll(viewRef.current);
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

    return (
      <>
        <div
          className={cn(
            "comet-editor-shell relative flex min-h-full w-full flex-1 flex-col",
            searchHighlightAllMatchesYellow &&
              "comet-codemirror-passive-search",
            searchQuery &&
              !searchHighlightAllMatchesYellow &&
              "comet-codemirror-active-search",
          )}
        >
          <div className="comet-editor-column">
            <div
              className="comet-codemirror-host flex min-h-0 flex-1 flex-col"
              ref={containerRef}
            />
          </div>
        </div>
        {toolbarContainer && !readOnly
          ? createPortal(
              <EditorToolbar
                state={toolbarState}
                onCycleBlockType={handleCycleBlockType}
                onInsertCodeBlock={handleInsertCodeBlock}
                onInsertImage={() => void handleInsertImage()}
                onInsertTable={handleInsertTable}
                onToggleInlineFormat={handleToggleInlineFormat}
              />,
              toolbarContainer,
            )
          : null}
      </>
    );
  },
);
