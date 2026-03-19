import { $createCodeNode, CodeNode } from "@lexical/code";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
} from "lexical";
import { $createHeadingNode, HeadingNode } from "@lexical/rich-text";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_TOOLBAR_STATE,
  getToolbarStateFromSelection,
} from "./toolbar-state";

function createTestEditor() {
  return createEditor({
    namespace: "toolbar-state-test",
    nodes: [CodeNode, HeadingNode],
    onError: (error) => {
      throw error;
    },
  });
}

describe("toolbar state", () => {
  it("returns default state when there is no range selection", () => {
    const editor = createTestEditor();
    let state = DEFAULT_TOOLBAR_STATE;

    editor.update(
      () => {
        const root = $getRoot();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode("Body"));
        root.append(paragraph);

        state = getToolbarStateFromSelection();
      },
      { discrete: true },
    );

    expect(state).toEqual(DEFAULT_TOOLBAR_STATE);
  });

  it("reflects the current range selection block type", () => {
    const editor = createTestEditor();
    let state = DEFAULT_TOOLBAR_STATE;

    editor.update(
      () => {
        const root = $getRoot();
        const heading = $createHeadingNode("h2");
        const text = $createTextNode("Body");
        heading.append(text);
        root.append(heading);
        text.select(0, text.getTextContentSize());

        state = getToolbarStateFromSelection();
      },
      { discrete: true },
    );

    expect(state).toEqual({
      blockType: "h2",
      isBold: false,
      isCode: false,
      isItalic: false,
      isStrikethrough: false,
    });
  });

  it("treats code block selections as code", () => {
    const editor = createTestEditor();
    let state = DEFAULT_TOOLBAR_STATE;

    editor.update(
      () => {
        const root = $getRoot();
        const code = $createCodeNode();
        const text = $createTextNode("const x = 1;");
        code.append(text);
        root.append(code);
        text.select(0, text.getTextContentSize());

        state = getToolbarStateFromSelection();
      },
      { discrete: true },
    );

    expect(state.blockType).toBe("code");
  });
});
