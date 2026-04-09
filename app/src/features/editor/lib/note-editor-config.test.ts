// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { drawSelection, EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { MARKDOWN_EDITOR_THEME } from "@/features/editor/lib/note-editor-config";

afterEach(() => {
  document.body.replaceChildren();
});

describe("MARKDOWN_EDITOR_THEME", () => {
  it("keeps nested table editor cursor layers visible when the root editor is inactive", () => {
    const parent = document.createElement("div");
    document.body.append(parent);

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: "cell",
        extensions: [drawSelection(), MARKDOWN_EDITOR_THEME],
      }),
    });

    view.dom.classList.add("comet-editor-inactive");

    const nestedEditor = document.createElement("div");
    nestedEditor.className = "cm-editor cm-md-table-cell-editor";
    nestedEditor.innerHTML = [
      '<div class="cm-scroller">',
      '<div class="cm-cursorLayer"></div>',
      '<div class="cm-content"></div>',
      "</div>",
    ].join("");
    view.dom.append(nestedEditor);

    const rootCursorLayer = view.scrollDOM.querySelector(".cm-cursorLayer");
    const nestedCursorLayer = nestedEditor.querySelector(".cm-cursorLayer");

    expect(rootCursorLayer).not.toBeNull();
    expect(nestedCursorLayer).not.toBeNull();
    expect(getComputedStyle(rootCursorLayer as Element).opacity).toBe("0");
    expect(getComputedStyle(nestedCursorLayer as Element).opacity).not.toBe(
      "0",
    );

    view.destroy();
  });
});
