import { EditorState } from "@codemirror/state";
import { LanguageDescription, syntaxTree } from "@codemirror/language";
import {
  markdown as markdownLanguage,
  markdownLanguage as markdownLang,
} from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { describe, expect, it } from "vitest";

describe("Code fence syntax highlighting", () => {
  it("uses the fenced language parser for broad language support", async () => {
    await LanguageDescription.matchLanguageName(languages, "ts")?.load();

    const state = EditorState.create({
      doc: "```ts\nconst value = 1\n```",
      extensions: [
        markdownLanguage({
          base: markdownLang,
          codeLanguages: languages,
        }),
      ],
    });

    const valuePosition = state.doc.toString().indexOf("value");
    const node = syntaxTree(state).resolveInner(valuePosition, 1);

    expect(node.name).toBe("VariableDefinition");
    expect(node.parent?.name).toBe("VariableDeclaration");
    expect(node.parent?.parent?.name).toBe("Script");
    expect(node.parent?.parent?.parent?.name).toBe("FencedCode");
  });
});
