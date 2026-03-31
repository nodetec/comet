import { describe, expect, it } from "vitest";
import { ImageNode, $createImageNode } from "../nodes/image-node";
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
} from "lexical";

import {
  ensureDecoratorCursorAnchors,
  INLINE_DECORATOR_ZWSP_ANCHOR,
} from "./inline-decorator-anchor";

function createTestEditor() {
  return createEditor({
    namespace: "inline-decorator-anchor-test",
    nodes: [ImageNode],
    onError: (error) => {
      throw error;
    },
  });
}

describe("ensureDecoratorCursorAnchors", () => {
  it("adds cursor anchors around an image between line breaks", () => {
    const editor = createTestEditor();
    let childTypes: string[] = [];
    let childTexts: string[] = [];

    editor.update(
      () => {
        const paragraph = $createParagraphNode();
        const image = $createImageNode({
          src: "asset:///attachments/test.png",
          altText: "test",
        });

        paragraph.append($createLineBreakNode(), image, $createLineBreakNode());
        $getRoot().append(paragraph);

        ensureDecoratorCursorAnchors(image);
        childTypes = paragraph.getChildren().map((child) => child.getType());
        childTexts = paragraph
          .getChildren()
          .map((child) => child.getTextContent());
      },
      { discrete: true },
    );

    expect(childTypes).toEqual([
      "linebreak",
      "text",
      "image",
      "text",
      "linebreak",
    ]);
    expect(childTexts).toEqual([
      "\n",
      INLINE_DECORATOR_ZWSP_ANCHOR,
      "",
      INLINE_DECORATOR_ZWSP_ANCHOR,
      "\n",
    ]);
  });

  it("does not add anchors when text already exists on both sides", () => {
    const editor = createTestEditor();
    let childTypes: string[] = [];
    let childTexts: string[] = [];

    editor.update(
      () => {
        const paragraph = $createParagraphNode();
        const image = $createImageNode({
          src: "asset:///attachments/test.png",
          altText: "test",
        });

        paragraph.append(
          $createTextNode("before"),
          image,
          $createTextNode("after"),
        );
        $getRoot().append(paragraph);

        ensureDecoratorCursorAnchors(image);
        childTypes = paragraph.getChildren().map((child) => child.getType());
        childTexts = paragraph
          .getChildren()
          .map((child) => child.getTextContent());
      },
      { discrete: true },
    );

    expect(childTypes).toEqual(["text", "image", "text"]);
    expect(childTexts).toEqual(["before", "", "after"]);
  });
});
