import { describe, expect, it } from "vitest";

import {
  collectSearchMatches,
  resolveActiveEditorSearch,
  searchWordsFromQuery,
} from "./search";

describe("searchWordsFromQuery", () => {
  it("deduplicates and trims search words", () => {
    expect(searchWordsFromQuery("  comet  comet search  ")).toEqual([
      "comet",
      "search",
    ]);
  });
});

describe("collectSearchMatches", () => {
  it("matches text case-insensitively", () => {
    expect(collectSearchMatches("Hello hello", "he")).toEqual([
      { from: 0, to: 2 },
      { from: 6, to: 8 },
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
