import { EditorState } from "@codemirror/state";
import { markdown as markdownLanguage } from "@codemirror/lang-markdown";
import { describe, expect, it } from "vitest";

import { findInlineImages } from "@/features/editor/lib/inline-images";

function createMarkdownState(doc: string) {
  return EditorState.create({
    doc,
    extensions: [markdownLanguage()],
  });
}

describe("inline image matcher", () => {
  it("finds markdown images in normal prose", () => {
    const state = createMarkdownState(
      "before\n\n![Cover](attachment://cover.png)\n\nafter",
    );

    expect(findInlineImages(state)).toEqual([
      {
        altText: "Cover",
        from: 8,
        src: "attachment://cover.png",
        to: 40,
      },
    ]);
  });

  it("skips image-looking text in inline code and fenced code", () => {
    const state = createMarkdownState(
      [
        "`![inline-code](attachment://code.png)`",
        "",
        "```md",
        "![fence](attachment://fence.png)",
        "```",
      ].join("\n"),
    );

    expect(findInlineImages(state)).toEqual([]);
  });

  it("finds multiple images in the same document", () => {
    const state = createMarkdownState(
      [
        "![One](attachment://one.png)",
        "",
        "text",
        "",
        "![Two](https://example.com/two.png)",
      ].join("\n"),
    );

    expect(findInlineImages(state)).toEqual([
      {
        altText: "One",
        from: 0,
        src: "attachment://one.png",
        to: 28,
      },
      {
        altText: "Two",
        from: 36,
        src: "https://example.com/two.png",
        to: 71,
      },
    ]);
  });
});
