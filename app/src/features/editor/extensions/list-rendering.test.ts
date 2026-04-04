// @vitest-environment jsdom

import { deleteCharBackward } from "@codemirror/commands";
import { EditorSelection, EditorState } from "@codemirror/state";
import {
  insertNewlineContinueMarkup,
  markdown as markdownLanguage,
  markdownLanguage as markdownLang,
} from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { markdownDecorations } from "@/features/editor/extensions/markdown-decorations";
import {
  deleteAcrossListBoundary,
  insertExplicitContinuationAfterContinuationLine,
  insertExplicitListContinuationBlock,
  moveAcrossListBoundary,
} from "@/features/editor/extensions/markdown-decorations/lists";

function createView(doc: string, cursor?: number) {
  const parent = document.createElement("div");
  document.body.append(parent);

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: cursor == null ? undefined : EditorSelection.cursor(cursor),
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

describe("List rendering", () => {
  it("resets ordered list numbering after a paragraph break", async () => {
    const { view } = createView(
      "1. First\n2. Second\n\nParagraph break\n\n1. Restart\n2. Again",
    );

    await flush();

    const markers = [
      ...view.dom.querySelectorAll(".cm-md-number-marker-source"),
    ].map((marker) => marker.getAttribute("style"));

    expect(markers).toEqual([
      '--display-number: "1. ";',
      '--display-number: "2. ";',
      '--display-number: "1. ";',
      '--display-number: "2. ";',
    ]);

    view.destroy();
  });

  it("preserves custom ordered list starts within each list block", async () => {
    const { view } = createView(
      "7. Start\n8. Continue\n\nParagraph break\n\n3. Restart\n4. Next",
    );

    await flush();

    const markers = [
      ...view.dom.querySelectorAll(".cm-md-number-marker-source"),
    ].map((marker) => marker.getAttribute("style"));

    expect(markers).toEqual([
      '--display-number: "7. ";',
      '--display-number: "8. ";',
      '--display-number: "3. ";',
      '--display-number: "4. ";',
    ]);

    view.destroy();
  });

  it("preserves source numbering for nested custom ordered lists", async () => {
    const { view } = createView(
      [
        "1. First item",
        "2. Second item",
        "3. Third item",
        "",
        "7. Ordered list starting from a custom number",
        "   8. Next custom-number item",
        "9. Another custom-number item",
      ].join("\n"),
    );

    await flush();

    const markers = [
      ...view.dom.querySelectorAll(".cm-md-number-marker-source"),
    ].map((marker) => marker.getAttribute("style"));

    expect(markers).toEqual([
      '--display-number: "1. ";',
      '--display-number: "2. ";',
      '--display-number: "3. ";',
      '--display-number: "7. ";',
      '--display-number: "8. ";',
      '--display-number: "9. ";',
    ]);

    view.destroy();
  });

  it("renumbers subsequent items when Enter creates a new list item", async () => {
    const doc = "1. First\n2. Second\n3. Third";
    const { view } = createView(doc, doc.indexOf("\n3."));

    await flush();

    insertNewlineContinueMarkup({
      state: view.state,
      dispatch: (tr) => view.dispatch(tr),
    });

    expect(view.state.doc.toString()).toBe(
      "1. First\n2. Second\n3. \n4. Third",
    );

    view.destroy();
  });

  it("renumbers subsequent items in a non-tight list", async () => {
    const doc = "1. First\n\n2. Second\n\n3. Third";
    const { view } = createView(doc, doc.indexOf("\n\n3."));

    await flush();

    insertNewlineContinueMarkup({
      state: view.state,
      dispatch: (tr) => view.dispatch(tr),
    });

    expect(view.state.doc.toString()).toBe(
      "1. First\n\n2. Second\n3. \n\n4. Third",
    );

    view.destroy();
  });

  it("inserts an explicit continuation block at the end of a list item on Shift-Enter", async () => {
    const doc = "1. First\n2. Second";
    const { view } = createView(doc, doc.length);

    await flush();

    expect(insertExplicitListContinuationBlock(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("1. First\n2. Second\n   ");

    await flush();

    const draftLine = [...view.dom.querySelectorAll(".cm-line")].find(
      (element) =>
        element.classList.contains("cm-md-list-child-draft") &&
        (element.textContent ?? "") === "",
    );

    expect(draftLine).toBeDefined();
    expect(draftLine?.getAttribute("style")).toContain(
      "--cm-md-list-child-indent",
    );

    view.destroy();
  });

  it("preserves quote and list indent when creating a quoted continuation block", async () => {
    const doc = ["> - Parent", ">   - Child"].join("\n");
    const { view } = createView(doc, doc.length);

    await flush();

    expect(insertExplicitListContinuationBlock(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("> - Parent\n>   - Child\n>     ");

    await flush();

    const draftLine = [...view.dom.querySelectorAll(".cm-line")].find(
      (element) =>
        element.classList.contains("cm-md-list-child-draft") &&
        element.classList.contains("cm-md-bq"),
    );

    expect(draftLine).toBeDefined();
    expect(draftLine?.getAttribute("style")).toContain(
      "--cm-md-list-child-indent",
    );

    view.destroy();
  });

  it("pressing Enter at the end of an explicit continuation line creates another explicit continuation line", async () => {
    const doc = "1. Item\n   typed";
    const { view } = createView(doc, doc.length);

    await flush();

    expect(insertExplicitContinuationAfterContinuationLine(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("1. Item\n   typed\n   ");

    await flush();

    const draftLine = [...view.dom.querySelectorAll(".cm-line")].find(
      (element) =>
        element.classList.contains("cm-md-list-child-draft") &&
        (element.textContent ?? "") === "",
    );

    expect(draftLine).toBeDefined();

    view.destroy();
  });

  it("pressing Enter at the end of a quoted explicit continuation line preserves the quoted continuation prefix", async () => {
    const doc = "> - Child\n>   typed";
    const { view } = createView(doc, doc.length);

    await flush();

    expect(insertExplicitContinuationAfterContinuationLine(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("> - Child\n>   typed\n>   ");

    await flush();

    const draftLine = [...view.dom.querySelectorAll(".cm-line")].find(
      (element) =>
        element.classList.contains("cm-md-list-child-draft") &&
        element.classList.contains("cm-md-bq"),
    );

    expect(draftLine).toBeDefined();

    view.destroy();
  });

  it("keeps continuation paragraphs visually attached to their list item", async () => {
    const { view } = createView(
      [
        "1. First item with an indented continuation paragraph",
        "",
        "   This paragraph should stay attached to the first item.",
        "",
        "2. Second item after a continuation paragraph",
      ].join("\n"),
    );

    await flush();

    const line = [...view.dom.querySelectorAll(".cm-line")].find((element) =>
      element.textContent?.includes(
        "This paragraph should stay attached to the first item.",
      ),
    );

    expect(line?.classList.contains("cm-md-list-child")).toBe(true);
    expect(line?.getAttribute("style")).toContain("--cm-md-list-child-indent");
    expect(line?.textContent?.startsWith(" ")).toBe(false);

    const emptyChildLine = [...view.dom.querySelectorAll(".cm-line")].find(
      (element) =>
        element.classList.contains("cm-md-list-child") &&
        (element.textContent ?? "") === "",
    );

    expect(emptyChildLine).toBeDefined();

    view.destroy();
  });

  it("hides raw continuation prefix spaces once content is typed", async () => {
    const { view } = createView("1. Item\n   typed");

    await flush();

    const line = [...view.dom.querySelectorAll(".cm-line")].find((element) =>
      element.textContent?.includes("typed"),
    );

    expect(line?.classList.contains("cm-md-list-child")).toBe(true);
    expect(line?.textContent).toBe("typed");

    view.destroy();
  });

  it("indents nested list item continuation lines deeper than top-level continuations", async () => {
    const { view } = createView("- Parent\n  - Child item\n    continuation");

    await flush();

    const line = [...view.dom.querySelectorAll(".cm-line")].find((element) =>
      element.textContent?.includes("continuation"),
    );

    expect(line?.classList.contains("cm-md-list-child")).toBe(true);
    expect(line?.getAttribute("style")).toContain("--cm-md-list-child-indent");
    expect(line?.textContent).toBe("continuation");

    view.destroy();
  });

  it("does not visually indent lazy continuation lines", async () => {
    const { view } = createView("- asdf\ntest");

    await flush();

    const line = [...view.dom.querySelectorAll(".cm-line")].find((element) =>
      element.textContent?.includes("test"),
    );

    expect(line?.classList.contains("cm-md-list-child")).toBe(false);
    expect(line?.textContent).toBe("test");

    view.destroy();
  });

  it("moves left from continuation content start to the end of the previous list line", async () => {
    const doc = "- First bullet\n  adsf";
    const { view } = createView(doc, doc.indexOf("adsf"));

    await flush();

    expect(moveAcrossListBoundary("left", view)).toBe(true);
    expect(view.state.selection.main.head).toBe(doc.indexOf("\n"));

    view.destroy();
  });

  it("backspace at continuation content start joins back to the previous list line", async () => {
    const doc = "- First bullet\n  adsf";
    const { view } = createView(doc, doc.indexOf("adsf"));

    await flush();

    expect(deleteAcrossListBoundary(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("- First bulletadsf");
    expect(view.state.selection.main.head).toBe("- First bullet".length);

    view.destroy();
  });

  it("backspace at nested continuation content start removes the full hidden prefix", async () => {
    const doc = "- Parent\n  - Child item\n    adsf";
    const { view } = createView(doc, doc.indexOf("adsf"));

    await flush();

    expect(deleteAcrossListBoundary(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("- Parent\n  - Child itemadsf");
    expect(view.state.selection.main.head).toBe(
      "- Parent\n  - Child item".length,
    );

    view.destroy();
  });

  it("backspace on an empty continuation line removes the whole blank continuation line", async () => {
    const doc = "- First bullet\n  ";
    const { view } = createView(doc, doc.length);

    await flush();

    expect(deleteCharBackward(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("- First bullet");
    expect(view.state.selection.main.head).toBe("- First bullet".length);

    view.destroy();
  });

  it("backspace at the start of an empty continuation line removes the whole blank continuation line", async () => {
    const doc = "- First bullet\n  ";
    const { view } = createView(doc, doc.indexOf("\n") + 1);

    await flush();

    expect(deleteCharBackward(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("- First bullet");

    view.destroy();
  });

  it("backspace at quoted continuation content start removes the quoted continuation prefix", async () => {
    const doc = "> - Child\n>   adsf";
    const { view } = createView(doc, doc.indexOf("adsf"));

    await flush();

    expect(deleteAcrossListBoundary(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("> - Childadsf");

    view.destroy();
  });

  it("backspace on an empty quoted continuation line removes the whole blank continuation line", async () => {
    const doc = "> - Child\n>   ";
    const { view } = createView(doc, doc.length);

    await flush();

    expect(deleteAcrossListBoundary(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("> - Child");
    expect(view.state.selection.main.head).toBe("> - Child".length);

    view.destroy();
  });

  it("keeps nested blockquotes visually attached to their list item", async () => {
    const { view } = createView(
      [
        "1. Ordered item before a blockquote",
        "",
        "   > Nested quote inside ordered item",
        "   > Still inside the ordered item",
        "",
        "2. Ordered item after a nested blockquote",
      ].join("\n"),
    );

    await flush();

    const line = [...view.dom.querySelectorAll(".cm-line")].find((element) =>
      element.textContent?.includes("Nested quote inside ordered item"),
    );

    expect(line?.classList.contains("cm-md-list-child")).toBe(true);
    expect(line?.classList.contains("cm-md-bq")).toBe(true);
    expect(line?.getAttribute("style")).toContain("--cm-md-list-child-indent");

    view.destroy();
  });

  it("uses tree depth for mixed ordered and unordered list indentation", async () => {
    const { view } = createView(
      [
        "1. Ordered parent",
        "   - Unordered child",
        "   - Another unordered child",
        "     1. Ordered grandchild",
        "     2. Ordered grandchild",
        "   - Back to unordered child level",
        "2. Second ordered parent",
        "   1. Nested ordered child",
        "   2. Nested ordered child",
        "      - Nested unordered grandchild",
        "      - Another nested unordered grandchild",
        "3. Third ordered parent",
      ].join("\n"),
    );

    await flush();

    const findListLine = (text: string) =>
      [...view.dom.querySelectorAll(".cm-line.cm-md-list")].find((element) =>
        element.textContent?.includes(text),
      );

    expect(findListLine("Ordered parent")?.getAttribute("style")).toContain(
      "--indent-level: 0",
    );
    expect(findListLine("Unordered child")?.getAttribute("style")).toContain(
      "--indent-level: 1",
    );
    expect(
      findListLine("Another unordered child")?.getAttribute("style"),
    ).toContain("--indent-level: 1");
    expect(findListLine("Ordered grandchild")?.getAttribute("style")).toContain(
      "--indent-level: 2",
    );
    expect(
      findListLine("Back to unordered child level")?.getAttribute("style"),
    ).toContain("--indent-level: 1");
    expect(
      findListLine("Second ordered parent")?.getAttribute("style"),
    ).toContain("--indent-level: 0");
    expect(
      findListLine("Nested ordered child")?.getAttribute("style"),
    ).toContain("--indent-level: 1");
    expect(
      findListLine("Nested unordered grandchild")?.getAttribute("style"),
    ).toContain("--indent-level: 2");
    expect(
      findListLine("Another nested unordered grandchild")?.getAttribute(
        "style",
      ),
    ).toContain("--indent-level: 2");
    expect(
      findListLine("Third ordered parent")?.getAttribute("style"),
    ).toContain("--indent-level: 0");

    view.destroy();
  });

  it("applies checked task strikethrough to task content instead of the marker slot", async () => {
    const { view } = createView(
      [
        "- [ ] Top-level unchecked task",
        "- [x] Top-level checked task",
        "- [ ] Parent task",
        "  - [x] Nested checked task",
      ].join("\n"),
    );

    await flush();

    const checkedContent = view.dom.querySelector(
      ".cm-md-task-content-checked",
    );
    expect(checkedContent).not.toBeNull();
    expect(checkedContent?.textContent).toContain("Top-level checked task");

    const nestedLine = [
      ...view.dom.querySelectorAll(".cm-line.cm-md-task-list"),
    ].find((element) => element.textContent?.includes("Nested checked task"));
    expect(nestedLine).not.toBeUndefined();
    expect(
      nestedLine?.querySelector(".cm-md-task-content-checked")?.textContent,
    ).toContain("Nested checked task");
    expect(nestedLine?.textContent).not.toContain("- Nested checked task");

    view.destroy();
  });
});
