import { describe, expect, it } from "vitest";

import {
  cycleBlockType,
  getToolbarState,
  insertCodeBlock,
  insertMarkdownTable,
  toggleInlineFormat,
} from "./toolbar-state";

describe("editor toolbar helpers", () => {
  it("wraps a selection with bold markers", () => {
    const result = toggleInlineFormat(
      "hello world",
      { anchor: 6, head: 11 },
      "bold",
    );

    expect(result.markdown).toBe("hello **world**");
    expect(result.selection).toEqual({ anchor: 8, head: 13 });
  });

  it("unwraps a bold selection when markers already surround it", () => {
    const result = toggleInlineFormat(
      "hello **world**",
      { anchor: 8, head: 13 },
      "bold",
    );

    expect(result.markdown).toBe("hello world");
    expect(result.selection).toEqual({ anchor: 6, head: 11 });
  });

  it("cycles the current line through heading levels", () => {
    const first = cycleBlockType("Title", { anchor: 5, head: 5 });
    const second = cycleBlockType(first.markdown, first.selection);

    expect(first.markdown).toBe("# Title");
    expect(first.selection).toEqual({ anchor: 7, head: 7 });
    expect(second.markdown).toBe("## Title");
    expect(second.selection).toEqual({ anchor: 8, head: 8 });
  });

  it("wraps the current selection in a fenced code block", () => {
    const result = insertCodeBlock("hello", { anchor: 0, head: 5 });

    expect(result.markdown).toBe("```\nhello\n```");
    expect(result.selection).toEqual({ anchor: 4, head: 9 });
  });

  it("inserts a starter markdown table and selects the first header", () => {
    const result = insertMarkdownTable("", { anchor: 0, head: 0 });

    expect(result.markdown).toBe(
      ["| Column 1 | Column 2 |", "| --- | --- |", "| Cell 1 | Cell 2 |"].join(
        "\n",
      ),
    );
    expect(result.selection).toEqual({ anchor: 2, head: 10 });
  });

  it("reads heading and inline format state from markdown source", () => {
    const doc = "## Hello **world**";
    const state = getToolbarState(doc, {
      anchor: doc.indexOf("world"),
      head: doc.indexOf("world") + "world".length,
    });

    expect(state).toEqual({
      blockType: "h2",
      isBold: true,
      isCode: false,
      isItalic: false,
      isStrikethrough: false,
    });
  });

  it("detects fenced code blocks as the current block type", () => {
    const doc = "```\nhello\n```";

    expect(getToolbarState(doc, { anchor: 5, head: 5 }).blockType).toBe("code");
  });
});
