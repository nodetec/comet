import {
  Annotation,
  EditorState,
  StateEffect,
  StateField,
} from "@codemirror/state";

import { setActiveTableCellEffect } from "@/features/editor/extensions/tables/state";
import type {
  ActiveTableCell,
  TableSection,
} from "@/features/editor/extensions/tables/types";

export type CellCoords = {
  col: number;
  row: number;
  section: TableSection;
};

export type TableRect = {
  maxCol: number;
  maxRow: number;
  minCol: number;
  minRow: number;
};

export type CellSelection = {
  anchor: CellCoords;
  focus: CellCoords;
  tableFrom: number;
};

export type CellSelectionDirection = "down" | "left" | "right" | "up";

export const cellSelectionTransitionAnnotation = Annotation.define<boolean>();
export const setCellSelectionEffect = StateEffect.define<CellSelection>();
export const clearCellSelectionEffect = StateEffect.define<void>();

export function getCellSelection(state: EditorState): CellSelection | null {
  return state.field(cellSelectionField, false) ?? null;
}

export function toUnifiedRow(coords: CellCoords): number {
  return coords.section === "header" ? 0 : coords.row + 1;
}

export function fromUnifiedRow(row: number, col: number): CellCoords {
  return row <= 0
    ? { col, row: 0, section: "header" }
    : { col, row: row - 1, section: "body" };
}

export function normalizeCellCoords(coords: CellCoords): CellCoords {
  return {
    col: coords.col,
    row: coords.section === "header" ? 0 : coords.row,
    section: coords.section,
  };
}

export function moveCellCoords(
  coords: CellCoords,
  direction: CellSelectionDirection,
): CellCoords {
  const unifiedRow = toUnifiedRow(coords);

  switch (direction) {
    case "left": {
      return fromUnifiedRow(unifiedRow, coords.col - 1);
    }
    case "right": {
      return fromUnifiedRow(unifiedRow, coords.col + 1);
    }
    case "up": {
      return fromUnifiedRow(unifiedRow - 1, coords.col);
    }
    case "down": {
      return fromUnifiedRow(unifiedRow + 1, coords.col);
    }
  }
}

export function selectionFromRect(
  tableFrom: number,
  rect: TableRect,
): CellSelection {
  return {
    anchor: fromUnifiedRow(rect.minRow, rect.minCol),
    focus: fromUnifiedRow(rect.maxRow, rect.maxCol),
    tableFrom,
  };
}

export function toSelectionRect(selection: CellSelection): TableRect {
  const anchorRow = toUnifiedRow(selection.anchor);
  const focusRow = toUnifiedRow(selection.focus);

  return {
    maxCol: Math.max(selection.anchor.col, selection.focus.col),
    maxRow: Math.max(anchorRow, focusRow),
    minCol: Math.min(selection.anchor.col, selection.focus.col),
    minRow: Math.min(anchorRow, focusRow),
  };
}

export function isCellInRect(rect: TableRect, coords: CellCoords): boolean {
  const unifiedRow = toUnifiedRow(coords);
  return (
    unifiedRow >= rect.minRow &&
    unifiedRow <= rect.maxRow &&
    coords.col >= rect.minCol &&
    coords.col <= rect.maxCol
  );
}

export const cellSelectionField = StateField.define<CellSelection | null>({
  create() {
    return null;
  },
  update(value, transaction) {
    let nextValue = value;
    let sawSetSelection = false;

    for (const effect of transaction.effects) {
      if (
        effect.is(clearCellSelectionEffect) ||
        effect.is(setActiveTableCellEffect)
      ) {
        nextValue = null;
        continue;
      }

      if (effect.is(setCellSelectionEffect)) {
        nextValue = effect.value;
        sawSetSelection = true;
      }
    }

    if (transaction.docChanged && !sawSetSelection) {
      return null;
    }

    return nextValue;
  },
});

export function activeCellToCoords(activeCell: ActiveTableCell): CellCoords {
  return {
    col: activeCell.col,
    row: activeCell.row,
    section: activeCell.section,
  };
}
