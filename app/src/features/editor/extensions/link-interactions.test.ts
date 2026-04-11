// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import {
  markdown as markdownLanguage,
  markdownLanguage as markdownLang,
} from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { shellStore } from "@/features/shell/store/use-shell-store";
import { WikiLinkGrammar } from "@/features/editor/extensions/markdown-decorations/wikilink-syntax";
import { CREATE_NOTE_FROM_WIKILINK_EVENT } from "@/shared/lib/note-navigation";

const { invokeMock, openUrlMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  openUrlMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: openUrlMock,
}));

import { markdownDecorations } from "@/features/editor/extensions/markdown-decorations";
import {
  findExternalLinkTargetAtPosition,
  resolveDraftWikiLinkTarget,
} from "@/features/editor/extensions/markdown-decorations/builders/links";

function createView(
  doc: string,
  readOnly = false,
  noteId: string | null = null,
) {
  const parent = document.createElement("div");
  document.body.append(parent);

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        markdownLanguage({
          base: markdownLang,
          extensions: [WikiLinkGrammar],
        }),
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        markdownDecorations({ noteId }),
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
  invokeMock.mockReset();
  openUrlMock.mockClear();
  shellStore.setState({
    draftMarkdown: "",
    draftNoteId: null,
    draftWikilinkResolutions: [],
  });
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

  it("does not open markdown links when the pointer lands in link padding", async () => {
    const doc = "[Example](https://example.com)";
    const { view } = createView(doc);

    await flush();

    const link = view.dom.querySelector(".cm-md-link");
    expect(link).not.toBeNull();

    const originalPosAtCoords = view.posAtCoords.bind(view);
    const originalPosAtDOM = view.posAtDOM.bind(view);
    const originalCoordsAtPos = view.coordsAtPos.bind(view);
    const createRangeSpy = vi.spyOn(document, "createRange").mockImplementation(
      () =>
        ({
          getClientRects: () => [],
          setEnd: () => {},
          setStart: () => {},
        }) as unknown as Range,
    );
    Object.assign(view, {
      coordsAtPos: (pos: number, side?: -1 | 1) => {
        if (pos === doc.indexOf("Example") && side === 1) {
          return DOMRect.fromRect({
            height: 20,
            width: 0,
            x: 10,
            y: 10,
          });
        }

        if (pos === doc.indexOf("Example") + "Example".length && side === -1) {
          return DOMRect.fromRect({
            height: 20,
            width: 0,
            x: 70,
            y: 10,
          });
        }

        return originalCoordsAtPos(pos, side);
      },
      posAtCoords: () => doc.indexOf("Example"),
      posAtDOM: () => doc.indexOf("Example"),
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
      coordsAtPos: originalCoordsAtPos,
      posAtCoords: originalPosAtCoords,
      posAtDOM: originalPosAtDOM,
    });
    createRangeSpy.mockRestore();
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

  it("prefers unsaved draft wikilink resolutions before backend lookup", () => {
    shellStore.setState({
      draftMarkdown: "[[Target]]",
      draftNoteId: "note-1",
      draftWikilinkResolutions: [
        {
          occurrenceId: "A1",
          location: 0,
          targetNoteId: "resolved-note",
          title: "Target",
        },
      ],
    });

    expect(
      resolveDraftWikiLinkTarget("note-1", {
        location: 0,
        title: "Target",
        type: "wikilink",
      }),
    ).toBe("resolved-note");
  });

  it("dispatches create-note for unresolved wikilinks", async () => {
    invokeMock.mockResolvedValueOnce(null);
    const eventHandler = vi.fn();
    window.addEventListener(CREATE_NOTE_FROM_WIKILINK_EVENT, eventHandler);

    const { view } = createView("[[Target]]", false, "note-1");
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
    await flush();

    expect(invokeMock).toHaveBeenCalledWith("resolve_wikilink", {
      input: {
        location: 0,
        sourceNoteId: "note-1",
        title: "Target",
      },
    });
    expect(eventHandler).toHaveBeenCalledTimes(1);
    expect((eventHandler.mock.calls[0]![0] as CustomEvent).detail).toEqual({
      location: 0,
      sourceNoteId: "note-1",
      title: "Target",
    });

    window.removeEventListener(CREATE_NOTE_FROM_WIKILINK_EVENT, eventHandler);
    view.destroy();
  });
});
