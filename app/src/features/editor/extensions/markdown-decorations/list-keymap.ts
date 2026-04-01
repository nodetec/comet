import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

const INDENT = "  ";
const LIST_MARKER_RE = /^(\s*)([-*+]|\d+[.)]) (\[[ xX]\] )?/;

/**
 * Returns the document position after the list marker + trailing space,
 * or -1 if the line isn't a list item.
 */
function getListMarkEnd(view: EditorView, pos: number): number {
  const line = view.state.doc.lineAt(pos);
  const match = LIST_MARKER_RE.exec(line.text);
  if (!match) {
    return -1;
  }
  return line.from + match[0].length;
}

export function indentListItem(view: EditorView): boolean {
  const { state } = view;
  const { main } = state.selection;

  if (!main.empty) {
    return false;
  }

  const markEnd = getListMarkEnd(view, main.head);
  if (markEnd === -1 || main.head > markEnd) {
    return false;
  }

  const line = state.doc.lineAt(main.head);
  view.dispatch({
    changes: { from: line.from, insert: INDENT },
    selection: EditorSelection.cursor(main.head + INDENT.length),
  });
  return true;
}

export function dedentListItem(view: EditorView): boolean {
  const { state } = view;
  const { main } = state.selection;

  if (!main.empty) {
    return false;
  }

  const markEnd = getListMarkEnd(view, main.head);
  if (markEnd === -1 || main.head > markEnd) {
    return false;
  }

  const line = state.doc.lineAt(main.head);
  const lineText = line.text;

  let removeCount = 0;
  if (lineText.startsWith(INDENT)) {
    removeCount = INDENT.length;
  } else if (lineText.startsWith(" ")) {
    removeCount = 1;
  }

  if (removeCount === 0) {
    return true;
  }

  view.dispatch({
    changes: { from: line.from, to: line.from + removeCount },
    selection: EditorSelection.cursor(
      Math.max(line.from, main.head - removeCount),
    ),
  });
  return true;
}
