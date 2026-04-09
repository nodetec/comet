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

describe("Advanced list rendering", () => {
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

  it("only toggles tasks when clicking the checkbox box, not the surrounding marker gutter", async () => {
    const { view } = createView("- [ ] Task item");

    await flush();

    const marker = view.dom.querySelector(".cm-md-task-marker-source");
    const checkbox = view.dom.querySelector(".cm-md-task-marker-box");

    expect(marker).not.toBeNull();
    expect(checkbox).not.toBeNull();

    marker?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        button: 0,
      }),
    );
    expect(view.state.doc.toString()).toBe("- [ ] Task item");

    checkbox?.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
      }),
    );
    checkbox?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        button: 0,
      }),
    );
    expect(view.state.doc.toString()).toBe("- [x] Task item");

    view.destroy();
  });

  it("does not leave a source spacer after the decorated task marker", async () => {
    const { view } = createView(
      "- [ ] Task item that should wrap onto another line",
    );

    await flush();

    const taskLine = view.dom.querySelector(".cm-line.cm-md-task-list");
    expect(taskLine).not.toBeNull();
    expect(taskLine?.textContent).toBe(
      "Task item that should wrap onto another line",
    );

    view.destroy();
  });
});
