// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import {
  markdown as markdownLanguage,
  markdownLanguage as markdownLang,
} from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";

const { openUrlMock } = vi.hoisted(() => ({
  openUrlMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: openUrlMock,
}));

import { markdownDecorations } from "@/features/editor/extensions/markdown-decorations";
import { findExternalLinkTargetAtPosition } from "@/features/editor/extensions/markdown-decorations/builders/links";

function createView(doc: string, readOnly = false) {
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
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
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
  openUrlMock.mockClear();
  document.body.replaceChildren();
});

describe("Editor link interactions", () => {
  it("finds inline markdown link targets from positions inside the label", () => {
    const doc = "[Example](https://example.com)";
    const state = EditorState.create({
      doc,
      extensions: [markdownLanguage()],
    });

    expect(
      findExternalLinkTargetAtPosition(state, doc.indexOf("Example")),
    ).toBe("https://example.com");
  });

  it("finds autolink targets", () => {
    const doc = "<https://example.com>";
    const state = EditorState.create({
      doc,
      extensions: [markdownLanguage()],
    });

    expect(
      findExternalLinkTargetAtPosition(state, doc.indexOf("example")),
    ).toBe("https://example.com");
  });

  it("finds plain external URL targets in prose", () => {
    const doc = "text https://github.com/nodeca/pica more";
    const state = EditorState.create({
      doc,
      extensions: [markdownLanguage()],
    });

    expect(findExternalLinkTargetAtPosition(state, doc.indexOf("nodeca"))).toBe(
      "https://github.com/nodeca/pica",
    );
  });

  it("ignores non-external markdown links", () => {
    const doc = "[Attachment](attachment://file.png)";
    const state = EditorState.create({
      doc,
      extensions: [markdownLanguage()],
    });

    expect(
      findExternalLinkTargetAtPosition(state, doc.indexOf("Attachment")),
    ).toBeNull();
  });

  it("ignores plain URLs inside inline code", () => {
    const doc = "`https://github.com/nodeca/pica`";
    const state = EditorState.create({
      doc,
      extensions: [markdownLanguage()],
    });

    expect(findExternalLinkTargetAtPosition(state, doc.indexOf("nodeca"))).toBe(
      null,
    );
  });

  it("opens markdown links on plain click in editable mode", async () => {
    const { view } = createView("[Example](https://example.com)");

    await flush();

    const link = view.dom.querySelector(".cm-md-link");
    expect(link).not.toBeNull();

    link?.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
      }),
    );
    link?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        button: 0,
      }),
    );

    expect(openUrlMock).toHaveBeenCalledWith("https://example.com");

    view.destroy();
  });

  it("opens plain external URLs on plain click", async () => {
    const { view } = createView("See https://github.com/nodeca/pica now");

    await flush();

    const link = [...view.dom.querySelectorAll(".cm-md-link")].find((element) =>
      element.textContent?.includes("https://github.com/nodeca/pica"),
    );
    expect(link).not.toBeNull();

    link?.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
      }),
    );
    link?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        button: 0,
      }),
    );

    expect(openUrlMock).toHaveBeenCalledWith("https://github.com/nodeca/pica");

    view.destroy();
  });

  it("opens markdown links on plain click in read-only mode", async () => {
    const { view } = createView("[Example](https://example.com)", true);

    await flush();

    const link = view.dom.querySelector(".cm-md-link");
    expect(link).not.toBeNull();

    link?.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
      }),
    );
    link?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        button: 0,
      }),
    );

    expect(openUrlMock).toHaveBeenCalledWith("https://example.com");

    view.destroy();
  });

  it("does not open links on non-primary clicks", async () => {
    const { view } = createView("[Example](https://example.com)");

    await flush();

    const link = view.dom.querySelector(".cm-md-link");
    expect(link).not.toBeNull();

    link?.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 1,
      }),
    );
    link?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        button: 1,
      }),
    );

    expect(openUrlMock).not.toHaveBeenCalled();

    view.destroy();
  });
});
