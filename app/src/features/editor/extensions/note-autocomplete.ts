import {
  completionStatus,
  startCompletion,
  autocompletion,
  type Completion,
  type CompletionContext,
} from "@codemirror/autocomplete";
import { EditorState, type Extension } from "@codemirror/state";
import { ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FileText, Hash } from "lucide-react";

import {
  findTagCompletionOptions,
  matchTagCompletionAtCursor,
} from "@/features/editor/lib/tags";
import {
  isRepresentableWikiLinkTitle,
  matchWikiLinkCompletionAtCursor,
  utf8ByteOffsetForText,
} from "@/features/editor/lib/wikilinks";
import { useShellStore } from "@/features/shell/store/use-shell-store";
import { searchNotes } from "@/shared/api/invoke";

const TAG_COMPLETION_TEXT_RE = /^[-/\p{L}\p{N}_]*$/u;

const TAG_COMPLETION_ICON_SVG = renderToStaticMarkup(
  createElement(Hash, {
    className: "cm-tag-completion-icon",
    size: 12,
    strokeWidth: 1.75,
  }),
);

const NOTE_COMPLETION_ICON_SVG = renderToStaticMarkup(
  createElement(FileText, {
    className: "cm-note-completion-icon",
    size: 12,
    strokeWidth: 1.75,
  }),
);

function renderCompletionIcon(type: string | null | undefined) {
  const iconWrapper = document.createElement("span");
  iconWrapper.setAttribute("aria-hidden", "true");

  if (type === "tag") {
    iconWrapper.className = "cm-tag-completion-icon-wrap";
    iconWrapper.innerHTML = TAG_COMPLETION_ICON_SVG;
    return iconWrapper;
  }

  iconWrapper.className = "cm-note-completion-icon-wrap";
  iconWrapper.innerHTML = NOTE_COMPLETION_ICON_SVG;
  return iconWrapper;
}

function buildTagCompletionSource(availableTagPaths: readonly string[]) {
  return (context: CompletionContext) => {
    if (context.state.facet(EditorState.readOnly)) {
      return null;
    }

    const { main } = context.state.selection;
    if (!main.empty || main.from !== context.pos) {
      return null;
    }

    const line = context.state.doc.lineAt(context.pos);
    const match = matchTagCompletionAtCursor(
      line.text,
      context.pos - line.from,
    );
    if (!match) {
      return null;
    }

    const options = findTagCompletionOptions(
      availableTagPaths,
      match.matchingString,
    ).map(
      (tagPath) =>
        ({
          label: tagPath,
          type: "tag",
        }) satisfies Completion,
    );

    if (options.length === 0) {
      return null;
    }

    return {
      from: line.from + match.from,
      options,
      to: line.from + match.to,
      validFor: TAG_COMPLETION_TEXT_RE,
    };
  };
}

function buildWikiLinkCompletionSource(noteId: string | null) {
  return async (context: CompletionContext) => {
    if (context.state.facet(EditorState.readOnly)) {
      return null;
    }

    const { main } = context.state.selection;
    if (!main.empty || main.from !== context.pos) {
      return null;
    }

    const line = context.state.doc.lineAt(context.pos);
    const match = matchWikiLinkCompletionAtCursor(
      line.text,
      context.pos - line.from,
    );
    if (!match) {
      return null;
    }

    const query = match.matchingString.trim();
    if (!query) {
      return null;
    }

    context.addEventListener("abort", () => {}, { onDocChange: true });

    const results = await searchNotes(query).catch(() => []);
    if (context.aborted) {
      return null;
    }

    const currentState = context.view?.state;
    if (currentState) {
      const { main: currentSelection } = currentState.selection;
      if (!currentSelection.empty) {
        return null;
      }

      const currentLine = currentState.doc.lineAt(currentSelection.from);
      const currentMatch = matchWikiLinkCompletionAtCursor(
        currentLine.text,
        currentSelection.from - currentLine.from,
      );
      if (!currentMatch || currentMatch.matchingString.trim() !== query) {
        return null;
      }
    }

    if (results.length === 0) {
      return null;
    }

    const options = results
      .filter((result) => isRepresentableWikiLinkTitle(result.title))
      .map(
        (result) =>
          ({
            label: result.title,
            detail: result.preview || undefined,
            type: "wikilink",
            apply(view, _completion, from, to) {
              const location = utf8ByteOffsetForText(
                view.state.doc.toString(),
                from - 2,
              );
              view.dispatch({
                changes: { from, to, insert: `${result.title}]]` },
              });
              if (noteId) {
                const occurrenceId = crypto
                  .randomUUID()
                  .replace(/-/g, "")
                  .toUpperCase();
                console.debug(
                  "[wikilinks] autocomplete selected wikilink target",
                  {
                    draftNoteId: useShellStore.getState().draftNoteId,
                    occurrenceId,
                    location,
                    noteId,
                    targetNoteId: result.id,
                    title: result.title,
                  },
                );
                useShellStore.getState().upsertDraftWikilinkResolution(noteId, {
                  occurrenceId,
                  location,
                  targetNoteId: result.id,
                  title: result.title,
                });
              } else {
                console.warn(
                  "[wikilinks] autocomplete selected wikilink without note id",
                  {
                    location,
                    targetNoteId: result.id,
                    title: result.title,
                  },
                );
              }
            },
          }) satisfies Completion,
      );

    if (options.length === 0) {
      return null;
    }

    return {
      from: line.from + match.from,
      options,
      to: line.from + match.to,
    };
  };
}

function hasTagCompletionContext(state: EditorState) {
  const { main } = state.selection;
  if (!main.empty) {
    return false;
  }

  const line = state.doc.lineAt(main.from);
  return matchTagCompletionAtCursor(line.text, main.from - line.from) !== null;
}

function hasWikiLinkCompletionContext(state: EditorState) {
  const { main } = state.selection;
  if (!main.empty) {
    return false;
  }

  const line = state.doc.lineAt(main.from);
  return (
    matchWikiLinkCompletionAtCursor(line.text, main.from - line.from) != null
  );
}

const reopenNoteAutocompleteOnBackspace = ViewPlugin.fromClass(
  class {
    private pendingReopen = false;

    update(update: ViewUpdate) {
      if (
        this.pendingReopen ||
        !update.docChanged ||
        !update.transactions.some((transaction) =>
          transaction.isUserEvent("delete.backward"),
        ) ||
        completionStatus(update.state) !== null ||
        (!hasTagCompletionContext(update.state) &&
          !hasWikiLinkCompletionContext(update.state))
      ) {
        return;
      }

      this.pendingReopen = true;
      queueMicrotask(() => {
        this.pendingReopen = false;

        if (
          completionStatus(update.view.state) === null &&
          (hasTagCompletionContext(update.view.state) ||
            hasWikiLinkCompletionContext(update.view.state))
        ) {
          startCompletion(update.view);
        }
      });
    }
  },
);

export function noteAutocomplete(
  noteId: string | null,
  availableTagPaths: readonly string[],
): Extension {
  const normalizedTagPaths: string[] = [];
  for (const tagPath of new Set(availableTagPaths)) {
    const insertAt = normalizedTagPaths.findIndex(
      (existingTagPath) => existingTagPath.localeCompare(tagPath) > 0,
    );

    if (insertAt === -1) {
      normalizedTagPaths.push(tagPath);
    } else {
      normalizedTagPaths.splice(insertAt, 0, tagPath);
    }
  }

  return [
    autocompletion({
      activateOnTyping: true,
      addToOptions: [
        {
          position: 20,
          render: (completion) => renderCompletionIcon(completion.type),
        },
      ],
      icons: false,
      override: [
        buildTagCompletionSource(normalizedTagPaths),
        buildWikiLinkCompletionSource(noteId),
      ],
      selectOnOpen: false,
    }),
    reopenNoteAutocompleteOnBackspace,
  ];
}
