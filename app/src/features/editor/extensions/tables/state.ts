import { EditorState, StateEffect, StateField } from "@codemirror/state";

import type { ActiveTableCell } from "@/features/editor/extensions/tables/types";

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
