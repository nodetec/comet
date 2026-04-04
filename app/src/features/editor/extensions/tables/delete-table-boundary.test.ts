// @vitest-environment jsdom

import {
  EditorSelection,
  EditorState,
  type EditorSelection as Selection,
} from "@codemirror/state";
import {
  markdown as markdownLanguage,
  markdownLanguage as markdownLang,
} from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { Table } from "@lezer/markdown";
import { afterEach, describe, expect, it } from "vitest";

import {
  deleteTableBackward,
  findTableBeforeCursor,
} from "@/features/editor/extensions/tables/delete-table-boundary";

function createView(doc: string, selection?: Selection) {
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
      ],
      selection,
    }),
  });

  return { parent, view };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("table boundary delete", () => {
  it("finds a table whose right edge matches the cursor", () => {
    const doc = ["| H |", "| --- |", "| A |"].join("\n");
    const { view } = createView(doc);

    expect(findTableBeforeCursor(view.state, doc.length)).toEqual({
      from: 0,
      to: doc.length,
    });

    view.destroy();
  });

  it("deletes the whole table when backspacing from its right boundary", () => {
    const doc = ["before", "", "| H |", "| --- |", "| A |", "", "after"].join(
      "\n",
    );
    const tableText = ["| H |", "| --- |", "| A |"].join("\n");
    const tableFrom = doc.indexOf(tableText);
    const tableTo = tableFrom + tableText.length;
    const { view } = createView(doc, EditorSelection.single(tableTo, tableTo));

    expect(deleteTableBackward(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("before\n\n\n\nafter");
    expect(view.state.selection.main.head).toBe(tableFrom);

    view.destroy();
  });

  it("does nothing when the cursor is not directly after a table", () => {
    const doc = ["| H |", "| --- |", "| A |", "", "after"].join("\n");
    const { view } = createView(
      doc,
      EditorSelection.single(doc.length, doc.length),
    );

    expect(deleteTableBackward(view)).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);

    view.destroy();
  });
});
