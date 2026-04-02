// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import {
  markdown as markdownLanguage,
  markdownLanguage as markdownLang,
} from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { Table } from "@lezer/markdown";
import { afterEach, describe, expect, it } from "vitest";

import { tables } from "@/features/editor/extensions/markdown-decorations/builders/tables";
import {
  getCellSelection,
  type CellSelection,
} from "@/features/editor/extensions/tables/cell-selection-state";
import {
  activeTableCellField,
  setActiveTableCellEffect,
} from "@/features/editor/extensions/tables/state";

class ResizeObserverMock {
  disconnect() {}
  observe() {}
  unobserve() {}
}

globalThis.ResizeObserver =
  ResizeObserverMock as unknown as typeof ResizeObserver;

function createView(doc: string) {
  const parent = document.createElement("div");
  document.body.append(parent);

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        markdownLanguage({
          base: markdownLang,
          extensions: [Table],
        }),
        tables(),
      ],
    }),
  });

  return { parent, view };
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise(requestAnimationFrame);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("table runtime", () => {
  it("opens a nested editor for the active table cell", async () => {
    const { view } = createView(
      ["| H1 | H2 |", "| --- | --- |", "| A1 | A2 |"].join("\n"),
    );

    view.dispatch({
      effects: setActiveTableCellEffect.of({
        col: 0,
        row: 0,
        section: "header",
        tableFrom: 0,
      }),
    });

    await flush();

    expect(
      view.dom.querySelector(
        ".cm-md-table-cell-active .cm-md-table-cell-editor",
      ),
    ).not.toBeNull();

    view.destroy();
  });

  it("normalizes malformed tables before opening the nested editor", async () => {
    const { view } = createView(
      ["| H1 |", "| --- |", "| A1 | A2 |"].join("\n"),
    );

    view.dispatch({
      effects: setActiveTableCellEffect.of({
        col: 0,
        row: 0,
        section: "body",
        tableFrom: 0,
      }),
    });

    await flush();

    expect(view.state.doc.toString()).toBe(
      ["| H1 |  |", "| --- | --- |", "| A1 | A2 |"].join("\n"),
    );
    expect(
      view.dom.querySelector(
        ".cm-md-table-cell-active .cm-md-table-cell-editor",
      ),
    ).not.toBeNull();

    view.destroy();
  });

  it("restores old cell content when switching the active cell", async () => {
    const { view } = createView(
      ["| H1 | H2 |", "| --- | --- |", "| A1 | A2 |"].join("\n"),
    );

    view.dispatch({
      effects: setActiveTableCellEffect.of({
        col: 0,
        row: 0,
        section: "header",
        tableFrom: 0,
      }),
    });
    await flush();

    view.dispatch({
      effects: setActiveTableCellEffect.of({
        col: 1,
        row: 0,
        section: "body",
        tableFrom: 0,
      }),
    });
    await flush();

    const previousCell = view.dom.querySelector(
      '.cm-md-table-cell[data-table-section="header"][data-table-row="0"][data-table-col="0"]',
    );
    const currentCell = view.dom.querySelector(
      '.cm-md-table-cell[data-table-section="body"][data-table-row="0"][data-table-col="1"]',
    );

    expect(
      previousCell?.querySelector(".cm-md-table-cell-content")?.textContent,
    ).toBe("H1");
    expect(
      currentCell?.querySelector(".cm-md-table-cell-editor"),
    ).not.toBeNull();

    view.destroy();
  });

  it("keeps the active-cell field registered on the editor state", () => {
    const { view } = createView("| H |\n| --- |\n| A |");

    expect(view.state.field(activeTableCellField, false)).toBeNull();

    view.destroy();
  });

  it("renders a menu trigger for each visible table cell", async () => {
    const { view } = createView(
      ["| H1 | H2 |", "| --- | --- |", "| A1 | A2 |"].join("\n"),
    );

    await flush();

    const cells = view.dom.querySelectorAll(".cm-md-table-cell");
    const triggers = view.dom.querySelectorAll(
      ".cm-md-table-cell-menu-trigger",
    );

    expect(cells.length).toBe(4);
    expect(triggers.length).toBe(4);

    view.destroy();
  });

  it("supports shift-drag multi-cell selection", async () => {
    const { view } = createView(
      ["| H1 | H2 |", "| --- | --- |", "| A1 | A2 |", "| B1 | B2 |"].join("\n"),
    );

    view.dispatch({
      effects: setActiveTableCellEffect.of({
        col: 0,
        row: 0,
        section: "header",
        tableFrom: 0,
      }),
    });
    await flush();

    const startCell = view.dom.querySelector(
      '.cm-md-table-cell[data-table-section="body"][data-table-row="0"][data-table-col="1"]',
    );
    const endCell = view.dom.querySelector(
      '.cm-md-table-cell[data-table-section="body"][data-table-row="1"][data-table-col="1"]',
    );

    expect(startCell).not.toBeNull();
    expect(endCell).not.toBeNull();

    startCell?.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        shiftKey: true,
      }),
    );
    endCell?.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        buttons: 1,
      }),
    );
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await flush();

    expect(getCellSelection(view.state)).toEqual<CellSelection>({
      anchor: {
        col: 0,
        row: 0,
        section: "header",
      },
      focus: {
        col: 1,
        row: 1,
        section: "body",
      },
      tableFrom: 0,
    });

    view.destroy();
  });
});
