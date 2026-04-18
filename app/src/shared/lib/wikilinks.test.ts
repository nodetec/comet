import { describe, expect, it } from "vitest";

import {
  extractWikiLinkOccurrences,
  isRepresentableWikiLinkTitle,
  matchWikiLinkCompletionAtCursor,
  normalizeWikiLinkTitle,
  utf8ByteOffsetForText,
} from "@/shared/lib/wikilinks";

describe("wikilink completion matching", () => {
  it("matches an open wikilink before closing brackets are present", () => {
    expect(matchWikiLinkCompletionAtCursor("[[Project Alp", 13)).toEqual({
      from: 2,
      hasClosingBrackets: false,
      matchingString: "Project Alp",
      to: 13,
    });
  });

  it("matches an open wikilink when closing brackets already exist", () => {
    expect(matchWikiLinkCompletionAtCursor("[[Project]]", 9)).toEqual({
      from: 2,
      hasClosingBrackets: true,
      matchingString: "Project",
      to: 11,
    });
  });

  it("matches and replaces the full wikilink label when the cursor is in the middle", () => {
    expect(matchWikiLinkCompletionAtCursor("[[Project]]", 5)).toEqual({
      from: 2,
      hasClosingBrackets: true,
      matchingString: "Project",
      to: 11,
    });
  });

  it("does not match escaped wikilink openers", () => {
    expect(matchWikiLinkCompletionAtCursor(String.raw`\[[Project`, 10)).toBe(
      null,
    );
  });

  it("preserves closing brackets when replacing an existing wikilink match", () => {
    const source = "[[Project]]";
    const match = matchWikiLinkCompletionAtCursor(source, 9);

    expect(match).not.toBeNull();

    const completed = `${source.slice(0, match!.from)}Chosen]]${source.slice(match!.to)}`;
    expect(completed).toBe("[[Chosen]]");
  });

  it("replaces the full existing wikilink when completing from the middle", () => {
    const source = "[[Project]]";
    const match = matchWikiLinkCompletionAtCursor(source, 5);

    expect(match).not.toBeNull();

    const completed = `${source.slice(0, match!.from)}Chosen]]${source.slice(match!.to)}`;
    expect(completed).toBe("[[Chosen]]");
  });

  it("converts CodeMirror string offsets to UTF-8 byte offsets", () => {
    const source = "cafe\u0301 [[Target]]";
    const jsOffset = source.indexOf("[[");

    expect(jsOffset).toBe(6);
    expect(utf8ByteOffsetForText(source, jsOffset)).toBe(7);
  });

  it("rejects titles that cannot be serialized as wikilinks", () => {
    expect(isRepresentableWikiLinkTitle("")).toBe(false);
    expect(isRepresentableWikiLinkTitle("   ")).toBe(false);
    expect(isRepresentableWikiLinkTitle("Target [draft]")).toBe(false);
    expect(isRepresentableWikiLinkTitle("Target\rNext")).toBe(false);
    expect(isRepresentableWikiLinkTitle("Target")).toBe(true);
  });

  it("normalizes wikilink titles like the backend", () => {
    expect(normalizeWikiLinkTitle("  Project   Alpha  ")).toBe("project alpha");
    expect(normalizeWikiLinkTitle("")).toBeNull();
  });

  it("ignores wikilinks inside inline code and fenced code blocks", () => {
    const markdown = [
      "[[Real]]",
      "",
      "`[[Inline Fake]]`",
      "",
      "  ```ts",
      "  const sample = '[[Fence Fake]]';",
      "  ```",
      "",
      "[[Also Real]]",
    ].join("\n");

    expect(extractWikiLinkOccurrences(markdown)).toEqual([
      {
        location: 0,
        title: "Real",
      },
      {
        location: utf8ByteOffsetForText(
          markdown,
          markdown.lastIndexOf("[[Also Real]]"),
        ),
        title: "Also Real",
      },
    ]);
  });
});
