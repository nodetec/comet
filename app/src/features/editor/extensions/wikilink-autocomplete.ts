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
import { FileText } from "lucide-react";

import { searchNotes } from "@/shared/api/invoke";
import { matchWikiLinkCompletionAtCursor } from "@/shared/lib/wikilinks";

const WIKILINK_COMPLETION_TEXT_RE = /^[^[\]\n\r]*$/;
const WIKILINK_COMPLETION_ICON_SVG = renderToStaticMarkup(
  createElement(FileText, {
    className: "cm-note-completion-icon",
    size: 12,
    strokeWidth: 1.75,
  }),
);

function renderWikiLinkCompletionIcon() {
  const iconWrapper = document.createElement("span");
  iconWrapper.setAttribute("aria-hidden", "true");
  iconWrapper.className = "cm-note-completion-icon-wrap";
  iconWrapper.innerHTML = WIKILINK_COMPLETION_ICON_SVG;
  return iconWrapper;
}

async function wikiLinkCompletionSource(context: CompletionContext) {
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

  const results = await searchNotes(query).catch(() => []);
  if (results.length === 0) {
    return null;
  }

  const options = results.map(
    (result) =>
      ({
        label: result.title,
        detail: result.preview || undefined,
        apply(view, _completion, from, to) {
          const suffix = match.hasClosingBrackets
            ? result.title
            : `${result.title}]]`;
          view.dispatch({
            changes: { from, to, insert: suffix },
          });
        },
      }) satisfies Completion,
  );

  return {
    from: line.from + match.from,
    options,
    to: line.from + match.to,
    validFor: WIKILINK_COMPLETION_TEXT_RE,
  };
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

const reopenWikiLinkAutocompleteOnBackspace = ViewPlugin.fromClass(
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
        !hasWikiLinkCompletionContext(update.state)
      ) {
        return;
      }

      this.pendingReopen = true;
      queueMicrotask(() => {
        this.pendingReopen = false;

        if (
          completionStatus(update.view.state) === null &&
          hasWikiLinkCompletionContext(update.view.state)
        ) {
          startCompletion(update.view);
        }
      });
    }
  },
);

export function wikilinkAutocomplete(): Extension {
  return [
    autocompletion({
      activateOnTyping: true,
      addToOptions: [
        {
          position: 20,
          render: () => renderWikiLinkCompletionIcon(),
        },
      ],
      icons: false,
      override: [wikiLinkCompletionSource],
      selectOnOpen: false,
    }),
    reopenWikiLinkAutocompleteOnBackspace,
  ];
}
