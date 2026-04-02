import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import {
  cellSelectionField,
  clearCellSelectionEffect,
  fromUnifiedRow,
  getCellSelection,
  isCellInRect,
  moveCellCoords,
  selectionFromRect,
  setCellSelectionEffect,
  toSelectionRect,
  toUnifiedRow,
} from "@/features/editor/extensions/tables/cell-selection-state";
import {
  activeTableCellField,
  setActiveTableCellEffect,
} from "@/features/editor/extensions/tables/state";

describe("table cell selection state", () => {
  it("converts between unified rows and cell coords", () => {
    expect(fromUnifiedRow(0, 2)).toEqual({
      col: 2,
      row: 0,
      section: "header",
    });
    expect(fromUnifiedRow(3, 1)).toEqual({
      col: 1,
      row: 2,
      section: "body",
    });

    expect(toUnifiedRow({ col: 1, row: 0, section: "header" })).toBe(0);
    expect(toUnifiedRow({ col: 1, row: 2, section: "body" })).toBe(3);
  });

  it("builds a rectangle from an anchor/focus pair", () => {
    const selection = {
      anchor: { col: 2, row: 0, section: "header" as const },
      focus: { col: 0, row: 1, section: "body" as const },
      tableFrom: 10,
    };

    expect(toSelectionRect(selection)).toEqual({
      maxCol: 2,
      maxRow: 2,
      minCol: 0,
      minRow: 0,
    });
  });

  it("creates a selection from a rectangle", () => {
    expect(
      selectionFromRect(15, {
        maxCol: 2,
        maxRow: 1,
        minCol: 1,
        minRow: 0,
      }),
    ).toEqual({
      anchor: { col: 1, row: 0, section: "header" },
      focus: { col: 2, row: 0, section: "body" },
      tableFrom: 15,
    });
  });

  it("checks whether a cell is inside a selection rect", () => {
    const rect = { maxCol: 2, maxRow: 2, minCol: 1, minRow: 0 };

    expect(isCellInRect(rect, { col: 1, row: 0, section: "header" })).toBe(
      true,
    );
    expect(isCellInRect(rect, { col: 2, row: 1, section: "body" })).toBe(true);
    expect(isCellInRect(rect, { col: 0, row: 1, section: "body" })).toBe(false);
  });

  it("moves cell coords in each direction", () => {
    const header = { col: 1, row: 0, section: "header" as const };
    const body = { col: 1, row: 2, section: "body" as const };

    expect(moveCellCoords(header, "down")).toEqual({
      col: 1,
      row: 0,
      section: "body",
    });
    expect(moveCellCoords(body, "up")).toEqual({
      col: 1,
      row: 1,
      section: "body",
    });
    expect(moveCellCoords(body, "left")).toEqual({
      col: 0,
      row: 2,
      section: "body",
    });
    expect(moveCellCoords(body, "right")).toEqual({
      col: 2,
      row: 2,
      section: "body",
    });
  });

  it("stores and clears cell selections via state effects", () => {
    let state = EditorState.create({
      doc: "",
      extensions: [activeTableCellField, cellSelectionField],
    });

    state = state.update({
      effects: setCellSelectionEffect.of({
        anchor: { col: 0, row: 0, section: "header" },
        focus: { col: 1, row: 0, section: "body" },
        tableFrom: 42,
      }),
    }).state;

    expect(getCellSelection(state)).toEqual({
      anchor: { col: 0, row: 0, section: "header" },
      focus: { col: 1, row: 0, section: "body" },
      tableFrom: 42,
    });

    state = state.update({
      effects: clearCellSelectionEffect.of(),
    }).state;

    expect(getCellSelection(state)).toBeNull();
  });

  it("clears cell selection when an active cell is set", () => {
    let state = EditorState.create({
      doc: "",
      extensions: [activeTableCellField, cellSelectionField],
    });

    state = state.update({
      effects: setCellSelectionEffect.of({
        anchor: { col: 0, row: 0, section: "header" },
        focus: { col: 0, row: 0, section: "body" },
        tableFrom: 5,
      }),
    }).state;

    state = state.update({
      effects: setActiveTableCellEffect.of({
        col: 1,
        row: 0,
        section: "body",
        tableFrom: 5,
      }),
    }).state;

    expect(getCellSelection(state)).toBeNull();
  });
});
