import { syntaxTree } from "@codemirror/language";
import { type EditorState, StateEffect, StateField } from "@codemirror/state";
import type { SyntaxNodeRef } from "@lezer/common";

import { parseMarkdownTable } from "@/features/editor/extensions/tables/markdown-table";
import type {
  ActiveTableCell,
  ResolvedActiveTableCell,
  ResolvedTable,
} from "@/features/editor/extensions/tables/types";

export const setActiveTableCellEffect = StateEffect.define<ActiveTableCell>();
export const clearActiveTableCellEffect = StateEffect.define<void>();

export function isSameActiveTableCell(
  left: ActiveTableCell | null,
  right: ActiveTableCell | null,
): boolean {
  return (
    left?.tableFrom === right?.tableFrom &&
    left?.section === right?.section &&
    left?.row === right?.row &&
    left?.col === right?.col
  );
}

export const activeTableCellField = StateField.define<ActiveTableCell | null>({
  create() {
    return null;
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(clearActiveTableCellEffect)) {
        return null;
      }

      if (effect.is(setActiveTableCellEffect)) {
        return effect.value;
      }
    }

    if (!value || !transaction.docChanged) {
      return value;
    }

    return {
      ...value,
      tableFrom: transaction.changes.mapPos(value.tableFrom, 1),
    };
  },
});

export function getActiveTableCell(state: EditorState): ActiveTableCell | null {
  return state.field(activeTableCellField, false) ?? null;
}

export function resolveTableByFrom(
  state: EditorState,
  tableFrom: number,
): ResolvedTable | null {
  let resolved: ResolvedTable | null = null;

  syntaxTree(state).iterate({
    enter(node: SyntaxNodeRef) {
      if (node.name !== "Table" || node.from !== tableFrom) {
        return;
      }

      const markdown = state.sliceDoc(node.from, node.to);
      const table = parseMarkdownTable(markdown);
      if (!table) {
        return;
      }

      resolved = {
        table,
        tableFrom: node.from,
        tableTo: node.to,
      };
    },
  });

  return resolved;
}

function resolveActiveTableCell(
  state: EditorState,
  activeCell: ActiveTableCell | null,
): ResolvedActiveTableCell | null {
  if (!activeCell) {
    return null;
  }

  const resolvedTable = resolveTableByFrom(state, activeCell.tableFrom);
  if (!resolvedTable) {
    return null;
  }

  const range =
    activeCell.section === "header"
      ? resolvedTable.table.cellRanges.headers[activeCell.col]
      : resolvedTable.table.cellRanges.rows[activeCell.row]?.[activeCell.col];
  const text =
    activeCell.section === "header"
      ? resolvedTable.table.headerCells[activeCell.col]
      : resolvedTable.table.bodyRows[activeCell.row]?.[activeCell.col];

  if (!range || text == null) {
    return null;
  }

  return {
    activeCell: {
      ...activeCell,
      tableFrom: resolvedTable.tableFrom,
    },
    editableFrom: resolvedTable.tableFrom + range.editableFrom,
    editableTo: resolvedTable.tableFrom + range.editableTo,
    table: resolvedTable.table,
    tableFrom: resolvedTable.tableFrom,
    tableTo: resolvedTable.tableTo,
    text,
  };
}

export const resolvedActiveTableCellField =
  StateField.define<ResolvedActiveTableCell | null>({
    create(state) {
      return resolveActiveTableCell(state, getActiveTableCell(state));
    },
    update(value, transaction) {
      if (!transaction.docChanged) {
        const previous = transaction.startState.field(
          activeTableCellField,
          false,
        );
        const next = transaction.state.field(activeTableCellField, false);
        if (previous === next) {
          return value;
        }
      }

      return resolveActiveTableCell(
        transaction.state,
        getActiveTableCell(transaction.state),
      );
    },
  });

export function getResolvedActiveTableCell(
  state: EditorState,
): ResolvedActiveTableCell | null {
  const cached = state.field(resolvedActiveTableCellField, false);
  if (cached !== undefined) {
    return cached;
  }

  return resolveActiveTableCell(state, getActiveTableCell(state));
}
