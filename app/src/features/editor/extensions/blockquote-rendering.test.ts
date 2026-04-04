// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import {
  markdown as markdownLanguage,
  markdownLanguage as markdownLang,
} from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { markdownDecorations } from "@/features/editor/extensions/markdown-decorations";

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
        }),
        markdownDecorations(),
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

describe("Blockquote rendering", () => {
  it("applies nested blockquote line classes and hides quote markers", async () => {
    const { view } = createView("> outer\n>> inner");

    await flush();

    expect(view.dom.querySelector(".cm-line.cm-md-bq-1")).not.toBeNull();
    expect(view.dom.querySelector(".cm-line.cm-md-bq-2")).not.toBeNull();
    expect(view.dom.textContent).not.toContain(">");

    view.destroy();
  });

  it("hides decorative quote bars on the line that is revealing raw markers", async () => {
    const { view } = createView("> outer\n>> inner");

    view.dispatch({
      selection: { anchor: 0 },
    });
    view.contentDOM.focus();

    await flush();

    const firstLine = view.dom.querySelector(".cm-line");
    expect(firstLine?.classList.contains("cm-md-bq")).toBe(false);
    expect(firstLine?.textContent).toContain("> outer");

    view.destroy();
  });

  it("does not shift the quote bar when nested lists appear inside a blockquote", async () => {
    const { view } = createView(
      [
        "> - Quoted bullet one",
        "> - Quoted bullet two",
        ">   - testing",
        ">   1. Quoted nested ordered item",
        ">   2. Quoted nested ordered item",
        "> - Quoted bullet three",
      ].join("\n"),
    );

    await flush();

    const nestedBulletLine = [...view.dom.querySelectorAll(".cm-line")].find(
      (element) => element.textContent?.includes("testing"),
    );
    const nestedOrderedLine = [...view.dom.querySelectorAll(".cm-line")].find(
      (element) => element.textContent?.includes("Quoted nested ordered item"),
    );

    expect(nestedBulletLine?.classList.contains("cm-md-bq")).toBe(true);
    expect(nestedOrderedLine?.classList.contains("cm-md-bq")).toBe(true);
    expect(nestedBulletLine?.getAttribute("style") ?? "").not.toContain(
      "--cm-md-list-child-indent",
    );
    expect(nestedOrderedLine?.getAttribute("style") ?? "").not.toContain(
      "--cm-md-list-child-indent",
    );

    view.destroy();
  });
});
