import { describe, expect, it } from "vitest";

import { resolveActiveEditorSearch, searchWordsFromQuery } from "./search";

describe("searchWordsFromQuery", () => {
  it("deduplicates and trims search words", () => {
    expect(searchWordsFromQuery("  comet  comet search  ")).toEqual([
      "comet",
      "search",
    ]);
  });
});

describe("resolveActiveEditorSearch", () => {
  it("uses the note pane query when it is the only search", () => {
    expect(
      resolveActiveEditorSearch({
        editorQuery: "",
        noteQuery: "comet",
      }),
    ).toEqual({
      query: "comet",
      source: "notes",
    });
  });

  it("uses the editor query when it is the only search", () => {
    expect(
      resolveActiveEditorSearch({
        editorQuery: "trail",
        noteQuery: "",
      }),
    ).toEqual({
      query: "trail",
      source: "editor",
    });
  });

  it("prefers the editor query when both searches have values", () => {
    expect(
      resolveActiveEditorSearch({
        editorQuery: "trail",
        noteQuery: "comet",
      }),
    ).toEqual({
      query: "trail",
      source: "editor",
    });
  });

  it("falls back to the remaining non-empty query when one side is cleared", () => {
    expect(
      resolveActiveEditorSearch({
        editorQuery: "",
        noteQuery: "comet",
      }),
    ).toEqual({
      query: "comet",
      source: "notes",
    });
  });
});
