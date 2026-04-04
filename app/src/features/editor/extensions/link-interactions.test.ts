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

  it("does not treat the position immediately after markdown link text as part of the link when using exact hit testing", () => {
    const doc = "[Example](https://example.com)";
    const state = EditorState.create({
      doc,
      extensions: [markdownLanguage()],
    });
    const afterLabel = doc.indexOf("Example") + "Example".length;

    expect(
      findExternalLinkTargetAtPosition(state, afterLabel, {
        allowPreviousCharacterFallback: false,
      }),
    ).toBeNull();
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

  it("does not treat the position immediately after a plain URL as part of the link", () => {
    const doc = "text https://github.com/nodeca/pica more";
    const state = EditorState.create({
      doc,
      extensions: [markdownLanguage()],
    });
    const url = "https://github.com/nodeca/pica";
    const afterUrl = doc.indexOf(url) + url.length;

    expect(findExternalLinkTargetAtPosition(state, afterUrl)).toBeNull();
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

  it("does not open markdown links when the click resolves to the right boundary", async () => {
    const doc = "[Example](https://example.com)";
    const { view } = createView(doc);

    await flush();

    const link = view.dom.querySelector(".cm-md-link");
    expect(link).not.toBeNull();

    const afterLabel = doc.indexOf("Example") + "Example".length;
    const originalPosAtCoords = view.posAtCoords.bind(view);
    Object.assign(view, {
      posAtCoords: () => afterLabel,
    });

    link?.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 100,
        clientY: 20,
      }),
    );
    link?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        button: 0,
        clientX: 100,
        clientY: 20,
      }),
    );

    expect(openUrlMock).not.toHaveBeenCalled();

    Object.assign(view, {
      posAtCoords: originalPosAtCoords,
    });
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

  it("does not open plain external URLs when the click resolves to the right boundary", async () => {
    const doc = "See https://github.com/nodeca/pica now";
    const url = "https://github.com/nodeca/pica";
    const { view } = createView(doc);

    await flush();

    const link = [...view.dom.querySelectorAll(".cm-md-link")].find((element) =>
      element.textContent?.includes(url),
    );
    expect(link).not.toBeNull();

    const afterUrl = doc.indexOf(url) + url.length;
    const originalPosAtCoords = view.posAtCoords.bind(view);
    Object.assign(view, {
      posAtCoords: () => afterUrl,
    });

    link?.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 100,
        clientY: 20,
      }),
    );
    link?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        button: 0,
        clientX: 100,
        clientY: 20,
      }),
    );

    expect(openUrlMock).not.toHaveBeenCalled();

    Object.assign(view, {
      posAtCoords: originalPosAtCoords,
    });
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
