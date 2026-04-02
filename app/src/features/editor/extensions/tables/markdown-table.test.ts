import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import {
  getCanonicalTableTextIfChanged,
  MarkdownTable,
  parseMarkdownTable,
} from "@/features/editor/extensions/tables/markdown-table";
import {
  activeCellToCoords,
  fromUnifiedRow,
} from "@/features/editor/extensions/tables/cell-selection-state";

describe("MarkdownTable", () => {
  it("normalizes ragged parsed tables", () => {
    const table = parseMarkdownTable(
      ["| H |", "| --- |", "| A | B |"].join("\n"),
    );

    expect(table).not.toBeNull();
    expect(table?.headerCells).toEqual(["H", ""]);
    expect(table?.alignments).toEqual([null, null]);
    expect(table?.bodyRows).toEqual([["A", "B"]]);
  });

  it("detects non-canonical table text", () => {
    const parsed = parseMarkdownTable(
      ["| H |", "| --- |", "| A | B |"].join("\n"),
    );
    expect(parsed).not.toBeNull();

    const canonical = getCanonicalTableTextIfChanged(
      {
        alignments: parsed!.alignments,
        bodyRows: parsed!.bodyRows,
        headerCells: parsed!.headerCells,
      },
      ["| H |", "| --- |", "| A | B |"].join("\n"),
    );

    expect(canonical).toBe(
      ["| H |  |", "| --- | --- |", "| A | B |"].join("\n"),
    );
  });

  it("inserts a header row before the existing header", () => {
    const table = MarkdownTable.fromParts({
      alignments: [null, null],
      bodyRows: [["A1", "A2"]],
      headerCells: ["H1", "H2"],
    });

    const next = table.insertRowRelativeTo("header", 0, "before");

    expect(next.headerCells).toEqual(["", ""]);
    expect(next.bodyRows).toEqual([
      ["H1", "H2"],
      ["A1", "A2"],
    ]);
  });

  it("inserts a body row after the header", () => {
    const table = MarkdownTable.fromParts({
      alignments: [null, null],
      bodyRows: [["A1", "A2"]],
      headerCells: ["H1", "H2"],
    });

    const next = table.insertRowRelativeTo("header", 0, "after");

    expect(next.headerCells).toEqual(["H1", "H2"]);
    expect(next.bodyRows).toEqual([
      ["", ""],
      ["A1", "A2"],
    ]);
  });

  it("promotes the first body row when deleting the header", () => {
    const table = MarkdownTable.fromParts({
      alignments: [null, null],
      bodyRows: [
        ["A1", "A2"],
        ["B1", "B2"],
      ],
      headerCells: ["H1", "H2"],
    });

    const next = table.deleteRowAt("header", 0);

    expect(next.headerCells).toEqual(["A1", "A2"]);
    expect(next.bodyRows).toEqual([["B1", "B2"]]);
  });

  it("inserts and deletes columns", () => {
    const table = MarkdownTable.fromParts({
      alignments: [null, "right"],
      bodyRows: [["A1", "A2"]],
      headerCells: ["H1", "H2"],
    });

    const inserted = table.insertColumn(0, "before");
    expect(inserted.headerCells).toEqual(["", "H1", "H2"]);
    expect(inserted.bodyRows).toEqual([["", "A1", "A2"]]);
    expect(inserted.alignments).toEqual([null, null, "right"]);

    const deleted = inserted.deleteColumn(1);
    expect(deleted.headerCells).toEqual(["", "H2"]);
    expect(deleted.bodyRows).toEqual([["", "A2"]]);
    expect(deleted.alignments).toEqual([null, "right"]);
  });

  it("clears a rectangular cell selection", () => {
    const table = MarkdownTable.fromParts({
      alignments: [null, null, null],
      bodyRows: [
        ["A1", "A2", "A3"],
        ["B1", "B2", "B3"],
      ],
      headerCells: ["H1", "H2", "H3"],
    });

    const next = table.clearRect({
      maxCol: 1,
      maxRow: 1,
      minCol: 0,
      minRow: 0,
    });

    expect(next.headerCells).toEqual(["", "", "H3"]);
    expect(next.bodyRows).toEqual([
      ["", "", "A3"],
      ["B1", "B2", "B3"],
    ]);
  });

  it("pastes a grid and expands rows and columns as needed", () => {
    const table = MarkdownTable.fromParts({
      alignments: [null, null],
      bodyRows: [["A1", "A2"]],
      headerCells: ["H1", "H2"],
    });

    const next = table.pasteGrid(fromUnifiedRow(1, 1), [
      ["X1", "X2"],
      ["Y1", "Y2"],
    ]);

    expect(next.headerCells).toEqual(["H1", "H2", ""]);
    expect(next.bodyRows).toEqual([
      ["A1", "X1", "X2"],
      ["", "Y1", "Y2"],
    ]);
  });

  it("serializes a table selection as markdown-friendly text", () => {
    const table = MarkdownTable.fromParts({
      alignments: ["left", "center"],
      bodyRows: [["A1", "A2"]],
      headerCells: ["H1", "H2"],
    });

    expect(table.serialize()).toBe(
      ["| H1 | H2 |", "| :--- | :---: |", "| A1 | A2 |"].join("\n"),
    );
  });

  it("maps active cell coords to generic cell coords", () => {
    expect(
      activeCellToCoords({
        col: 2,
        row: 1,
        section: "body",
        tableFrom: 10,
      }),
    ).toEqual({
      col: 2,
      row: 1,
      section: "body",
    });
  });

  it("parses canonical markdown into valid cell ranges", () => {
    const state = EditorState.create({
      doc: ["| H1 | H2 |", "| --- | --- |", "| A1 | A2 |"].join("\n"),
    });

    const table = parseMarkdownTable(state.doc.toString());
    expect(table?.cellRanges.headers).toHaveLength(2);
    expect(table?.cellRanges.rows[0]).toHaveLength(2);
  });
});
