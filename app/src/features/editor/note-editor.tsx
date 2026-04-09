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
import { deleteTableBackward } from "@/features/editor/extensions/tables/delete-table-boundary";
import {
  getHorizontalRuleSelection,
  getTableBoundarySelection,
} from "@/features/editor/lib/note-editor-selection";
import { useNoteEditorSearchSync } from "@/features/editor/hooks/use-note-editor-search-sync";
import { useNoteEditorToolbarActions } from "@/features/editor/hooks/use-note-editor-toolbar-actions";
import { useShellStore } from "@/features/shell/store/use-shell-store";
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
    const prevPaneRef = useRef(useShellStore.getState().focusedPane);
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
              if (trySnapInlineSyntaxRightBoundaryClick(view, event)) {
                return true;
              }

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
              const directPos = view.posAtCoords(
                {
                  x: event.clientX,
                  y: event.clientY,
                },
                false,
              );

              if (!view.hasFocus) {
                event.preventDefault();

                const scrollContainer = findEditorScrollContainer(view);
                const scrollTop = scrollContainer?.scrollTop ?? 0;
                const clickedInsideTable =
                  event.target instanceof HTMLElement &&
                  event.target.closest(".cm-md-table-wrapper");

                view.focus();

                if (scrollContainer) {
                  lockEditorScrollPosition(scrollContainer, scrollTop);
                }

                if (clickedInsideTable) {
                  return false;
                }

                if (directPos != null) {
                  view.dispatch({
                    selection: EditorSelection.cursor(directPos),
                    scrollIntoView: false,
                  });
                }

                return true;
              }

              return false;
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
            if (update.docChanged && !applyingExternalChangeRef.current) {
              onChangeRef.current(update.state.doc.toString());
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
              onSearchMatchCountChangeRef.current?.(
                countSearchMatches(update.state, query),
              );
            }

            if (update.docChanged || update.selectionSet) {
              setToolbarState(
                getToolbarState(update.state.doc.toString(), {
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
      const unsubscribeShell = useShellStore.subscribe((state) => {
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
          annotations: Transaction.addToHistory.of(false),
        });

        if (autoFocus) {
          view.dispatch({
            selection: EditorSelection.cursor(view.state.doc.length),
          });
          view.focus();
          onAutoFocusHandled?.();
        } else {
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

    return (
      <>
        <div
          className={cn(
            "comet-editor-shell relative flex min-h-full w-full flex-1",
            searchHighlightAllMatchesYellow &&
              "comet-codemirror-passive-search",
            searchQuery &&
              !searchHighlightAllMatchesYellow &&
              "comet-codemirror-active-search",
          )}
        >
          <div className="comet-editor-column">
            <div
              className="comet-codemirror-host min-h-full flex-1"
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
