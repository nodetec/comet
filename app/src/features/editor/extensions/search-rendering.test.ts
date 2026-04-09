// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import {
  markdown as markdownLanguage,
  markdownLanguage as markdownLang,
} from "@codemirror/lang-markdown";
import {
  openSearchPanel,
  SearchQuery,
  setSearchQuery,
  search,
} from "@codemirror/search";
import { EditorView } from "@codemirror/view";
import { Strikethrough, Table, TaskList } from "@lezer/markdown";
import { afterEach, describe, expect, it } from "vitest";

import { inlineImages } from "@/features/editor/extensions/inline-images";
import {
  HighlightSyntax,
  markdownDecorations,
} from "@/features/editor/extensions/markdown-decorations";
import {
  TagGrammar,
  tagHighlightStyle,
} from "@/features/editor/extensions/markdown-decorations/tag-syntax";

class ResizeObserverMock {
  disconnect() {}
  observe() {}
  unobserve() {}
}

globalThis.ResizeObserver =
  ResizeObserverMock as unknown as typeof ResizeObserver;

function createView(doc: string, searchQuery = "") {
  const parent = document.createElement("div");
  document.body.append(parent);

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        markdownLanguage({
          base: markdownLang,
          extensions: [
            Strikethrough,
            Table,
            TaskList,
            HighlightSyntax,
            TagGrammar,
          ],
        }),
        inlineImages({ searchQuery }),
        markdownDecorations({ searchQuery }),
        tagHighlightStyle,
        search(),
      ],
    }),
  });

  openSearchPanel(view);
  view.dispatch({
    effects: setSearchQuery.of(
      new SearchQuery({ literal: true, search: searchQuery }),
    ),
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

describe("CodeMirror search rendering", () => {
  it("shows all matches, not only the selected one", async () => {
    const { view } = createView("l one\nl two\nl three", "l");

    await flush();

    expect(view.dom.querySelectorAll(".cm-searchMatch").length).toBeGreaterThan(
      1,
    );

    view.destroy();
  });

  it("reveals inline code source for matching search results", async () => {
    const { view } = createView("prefix `lorem` suffix", "l");

    await flush();

    const searchMatch = view.dom.querySelector(".cm-searchMatch");
    expect(searchMatch).not.toBeNull();
    expect(searchMatch?.textContent).toBe("l");
    expect(view.dom.textContent).toContain("`lorem`");

    view.destroy();
  });

  it("keeps fenced code block styling when search matches inside the block", async () => {
    const { view } = createView("```ts\nlet value = 1;\n```", "value");

    await flush();

    expect(view.dom.querySelector(".cm-md-codeblock")).not.toBeNull();
    expect(view.dom.querySelector(".cm-searchMatch")).not.toBeNull();

    view.destroy();
  });

  it("keeps heading styling while revealing matched header syntax", async () => {
    const { view } = createView("# lorem ipsum", "l");

    await flush();

    expect(view.dom.querySelector(".cm-md-heading")).not.toBeNull();
    expect(view.dom.querySelector(".cm-md-h1")).not.toBeNull();
    expect(view.dom.querySelector(".cm-searchMatch")?.textContent).toBe("l");
    expect(view.dom.textContent).toContain("# lorem ipsum");

    view.destroy();
  });

  it("keeps heading prefix matches inline instead of wrapping the heading fragment", async () => {
    const { view } = createView("# lorem ipsum", "#");

    await flush();

    expect(view.dom.querySelector(".cm-md-heading")).not.toBeNull();
    expect(view.dom.querySelector(".cm-md-heading-inline")).not.toBeNull();
    expect(view.dom.querySelector(".cm-searchMatch")?.textContent).toBe("#");
    expect(view.dom.textContent).toContain("# lorem ipsum");

    view.destroy();
  });
});
