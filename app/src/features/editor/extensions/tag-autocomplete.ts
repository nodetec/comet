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
import { Hash } from "lucide-react";

import {
  findTagCompletionOptions,
  matchTagCompletionAtCursor,
} from "@/shared/lib/tags";

const TAG_COMPLETION_TEXT_RE = /^[-/\p{L}\p{N}_]*$/u;
const TAG_COMPLETION_ICON_SVG = renderToStaticMarkup(
  createElement(Hash, {
    className: "cm-tag-completion-icon",
    size: 12,
    strokeWidth: 1.75,
  }),
);

function renderTagCompletionIcon() {
  const iconWrapper = document.createElement("span");
  iconWrapper.setAttribute("aria-hidden", "true");
  iconWrapper.className = "cm-tag-completion-icon-wrap";
  iconWrapper.innerHTML = TAG_COMPLETION_ICON_SVG;
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

function hasTagCompletionContext(state: EditorState) {
  const { main } = state.selection;
  if (!main.empty) {
    return false;
  }

  const line = state.doc.lineAt(main.from);
  return matchTagCompletionAtCursor(line.text, main.from - line.from) !== null;
}

const reopenTagAutocompleteOnBackspace = ViewPlugin.fromClass(
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
        !hasTagCompletionContext(update.state)
      ) {
        return;
      }

      this.pendingReopen = true;
      queueMicrotask(() => {
        this.pendingReopen = false;

        if (
          completionStatus(update.view.state) === null &&
          hasTagCompletionContext(update.view.state)
        ) {
          startCompletion(update.view);
        }
      });
    }
  },
);

export function tagAutocomplete(
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
          render: () => renderTagCompletionIcon(),
        },
      ],
      icons: false,
      override: [buildTagCompletionSource(normalizedTagPaths)],
      selectOnOpen: false,
    }),
    reopenTagAutocompleteOnBackspace,
  ];
}
