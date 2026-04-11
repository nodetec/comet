import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { Vim } from "@replit/codemirror-vim";

import { getEditorScrollContainer } from "@/features/editor/lib/view-utils";

let vimNavigationRegistered = false;

export function ensureNoteEditorVimNavigation() {
  if (vimNavigationRegistered) {
    return;
  }

  vimNavigationRegistered = true;

  Vim.defineAction("scrollPageDown", (cm: { cm6: EditorView }) => {
    const view = cm.cm6;
    const el = getEditorScrollContainer(view);
    const pageHeight = el.clientHeight;
    el.scrollBy({ top: pageHeight, behavior: "smooth" });
    const targetTop = el.scrollTop + pageHeight;
    const pos = view.lineBlockAtHeight(targetTop - view.documentTop).from;
    view.dispatch({ selection: EditorSelection.cursor(pos) });
  });

  Vim.defineAction("scrollPageUp", (cm: { cm6: EditorView }) => {
    const view = cm.cm6;
    const el = getEditorScrollContainer(view);
    const pageHeight = el.clientHeight;
    el.scrollBy({ top: -pageHeight, behavior: "smooth" });
    const targetTop = Math.max(0, el.scrollTop - pageHeight);
    const pos = view.lineBlockAtHeight(targetTop - view.documentTop).from;
    view.dispatch({ selection: EditorSelection.cursor(pos) });
  });

  Vim.mapCommand(
    "<C-j>",
    "action",
    "scrollPageDown",
    {},
    { context: "normal" },
  );
  Vim._mapCommand({
    keys: "<C-k>",
    type: "action",
    action: "scrollPageUp",
    actionArgs: {},
    context: "normal",
  } as never);
}
