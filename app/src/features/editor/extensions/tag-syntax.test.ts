import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
  markdown as markdownLanguage,
  markdownLanguage as markdownLang,
} from "@codemirror/lang-markdown";
import { describe, expect, it } from "vitest";

import { TagGrammar } from "@/features/editor/extensions/markdown-decorations/tag-syntax";

function createState(doc: string) {
  return EditorState.create({
    doc,
    extensions: [
      markdownLanguage({
        base: markdownLang,
        extensions: [TagGrammar],
      }),
    ],
  });
}

function resolveNodeName(state: EditorState, position: number) {
  const tree =
    ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state);
  return tree.resolveInner(position, 1).name;
}

describe("tag syntax grammar", () => {
  it("parses valid hashtag tokens", () => {
    const state = createState("hello #roadmap there");
    const position = state.doc.toString().indexOf("roadmap");

    expect(resolveNodeName(state, position)).toBe("Hashtag");
  });

  it("rejects numeric-leading hashtag tokens", () => {
    const state = createState("hello #2026roadmap there");
    const position = state.doc.toString().indexOf("2026roadmap");

    expect(resolveNodeName(state, position)).not.toBe("Hashtag");
  });
});
