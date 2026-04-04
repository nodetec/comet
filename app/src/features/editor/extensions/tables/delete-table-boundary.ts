import { syntaxTree } from "@codemirror/language";
import { EditorSelection, type EditorState } from "@codemirror/state";
import { type EditorView } from "@codemirror/view";

type TableRange = {
  from: number;
  to: number;
};

export function findTableBeforeCursor(
  state: EditorState,
  cursor: number,
): TableRange | null {
  let tableRange: TableRange | null = null;

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "Table" || node.to !== cursor) {
        return;
      }

      tableRange = {
        from: node.from,
        to: node.to,
      };
    },
  });

  return tableRange;
}

export function deleteTableBackward(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const tableRange = findTableBeforeCursor(view.state, selection.head);
  if (!tableRange) {
    return false;
  }

  view.dispatch({
    changes: {
      from: tableRange.from,
      to: tableRange.to,
    },
    selection: EditorSelection.cursor(tableRange.from),
    scrollIntoView: false,
  });

  return true;
}
