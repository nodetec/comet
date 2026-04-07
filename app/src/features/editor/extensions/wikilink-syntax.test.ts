import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
  markdown as markdownLanguage,
  markdownLanguage as markdownLang,
} from "@codemirror/lang-markdown";
import { describe, expect, it } from "vitest";

import { WikiLinkGrammar } from "@/features/editor/extensions/markdown-decorations/wikilink-syntax";

function createState(doc: string) {
  return EditorState.create({
    doc,
    extensions: [
      markdownLanguage({
        base: markdownLang,
        extensions: [WikiLinkGrammar],
      }),
    ],
  });
}

function resolveNodeName(state: EditorState, position: number) {
  const tree =
    ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state);
  return tree.resolveInner(position, 1).name;
}

describe("wikilink syntax grammar", () => {
  it("parses valid wikilinks", () => {
    const state = createState("hello [[Project Alpha]] there");
    const position = state.doc.toString().indexOf("Project Alpha");

    expect(resolveNodeName(state, position)).toBe("WikiLink");
  });

  it("rejects empty wikilinks", () => {
    const state = createState("hello [[]] there");
    const position = state.doc.toString().indexOf("]]");

    expect(resolveNodeName(state, position)).not.toBe("WikiLink");
  });

  it("does not parse escaped wikilinks", () => {
    const state = createState(String.raw`hello \[[Project Alpha]] there`);
    const position = state.doc.toString().indexOf("Project Alpha");

    expect(resolveNodeName(state, position)).not.toBe("WikiLink");
  });
});
