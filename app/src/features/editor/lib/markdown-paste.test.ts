// @vitest-environment jsdom

import fixtures from "@/shared/lib/editor-paste-fixtures.json";
import { $generateNodesFromDOM } from "@lexical/html";
import { CodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import {
  $isListItemNode,
  $isListNode,
  ListItemNode,
  ListNode,
} from "@lexical/list";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import { createEditor, $getRoot } from "lexical";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
  invoke: vi.fn(),
}));

vi.mock("@/shared/lib/attachments", () => ({
  resolveImageSrc: (src: string) =>
    src.startsWith("attachment://")
      ? `asset:///attachments/${src.slice("attachment://".length)}`
      : src,
  unresolveImageSrc: (src: string) =>
    src.startsWith("asset:///attachments/")
      ? `attachment://${src.slice("asset:///attachments/".length)}`
      : src,
}));

import { ImageNode } from "../nodes/image-node";
import { YouTubeNode } from "../nodes/youtube-node";
import { CometHorizontalRuleNode } from "../nodes/comet-horizontal-rule-node";
import { ListAnchorNode } from "../nodes/list-anchor-node";
import {
  $exportMarkdown,
  createNormalizedMarkdownNodesFromHTML,
  normalizeImportedNodes,
} from "./markdown";
import {
  isBlockLevelNode,
  parseSingleFencedCodeBlock,
  trimBoundaryEmptyParagraphs,
} from "./markdown-paste";
import { TRANSFORMERS } from "../transformers";

const TEST_NODES = [
  AutoLinkNode,
  CodeNode,
  CometHorizontalRuleNode,
  HeadingNode,
  ImageNode,
  LinkNode,
  ListAnchorNode,
  ListItemNode,
  ListNode,
  QuoteNode,
  TableCellNode,
  TableNode,
  TableRowNode,
  YouTubeNode,
];

function createTestEditor() {
  return createEditor({
    namespace: "markdown-paste-test",
    nodes: TEST_NODES,
    onError: (error) => {
      throw error;
    },
  });
}

function htmlToDOM(html: string): Document {
  return new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body>${html}</body></html>`,
    "text/html",
  );
}

function getDirectItemText(item: ListItemNode): string {
  return item
    .getChildren()
    .filter((child) => !$isListNode(child))
    .map((child) => child.getTextContent())
    .join("")
    .trim();
}

describe("parseSingleFencedCodeBlock", () => {
  it.each(fixtures.fencedCodeBlockCases)(
    "parses a single fenced code block: $id",
    (fixture) => {
      expect(parseSingleFencedCodeBlock(fixture.markdown)).toEqual({
        code: fixture.code,
        language: fixture.language,
      });
    },
  );
});

describe("trimBoundaryEmptyParagraphs", () => {
  it.each(fixtures.mixedBlockPasteCases)(
    "preserves mixed block markdown without boundary drift: $id",
    (fixture) => {
      const editor = createTestEditor();
      let output = "";

      editor.update(
        () => {
          const allNodes = createNormalizedMarkdownNodesFromHTML(
            editor,
            fixture.html,
            fixture.markdown,
          );
          const filteredNodes = allNodes.filter(isBlockLevelNode);
          const nodes = trimBoundaryEmptyParagraphs(
            filteredNodes,
            fixture.markdown,
          );
          $getRoot().append(...nodes);
          output = $exportMarkdown(TRANSFORMERS);
        },
        { discrete: true },
      );

      expect(output).toBe(fixture.markdown);
    },
  );
});

describe("normalizeImportedNodes", () => {
  it("merges wrapper-only nested bullet list items created by mixed markers", () => {
    const editor = createTestEditor();
    let nestedParentTexts: string[] = [];
    let nestedLeafTexts: string[] = [];

    editor.update(
      () => {
        const dom = htmlToDOM(
          [
            "<ul>",
            "<li>",
            "Sub-lists are made by indenting 2 spaces:",
            "<ul>",
            "<li>",
            "Marker character change forces new list start:",
            "<ul><li>Ac tristique libero volutpat at</li></ul>",
            "</li>",
            "<li><ul><li>Facilisis in pretium nisl aliquet</li></ul></li>",
            "<li><ul><li>Nulla volutpat aliquam velit</li></ul></li>",
            "</ul>",
            "</li>",
            "</ul>",
          ].join(""),
        );

        const nodes = normalizeImportedNodes(
          $generateNodesFromDOM(editor, dom),
        );
        $getRoot().append(...nodes);

        const topLevelList = $getRoot().getFirstChild();
        if (!$isListNode(topLevelList)) {
          return;
        }

        const outerItem = topLevelList.getFirstChild();
        if (!$isListItemNode(outerItem)) {
          return;
        }

        const nestedList = outerItem.getChildren().find($isListNode);
        if (!$isListNode(nestedList)) {
          return;
        }

        const nestedItems = nestedList.getChildren().filter($isListItemNode);
        nestedParentTexts = nestedItems.map(getDirectItemText);

        const leafList = nestedItems[0]?.getChildren().find($isListNode);
        if (!$isListNode(leafList)) {
          return;
        }

        nestedLeafTexts = leafList
          .getChildren()
          .filter($isListItemNode)
          .map(getDirectItemText);
      },
      { discrete: true },
    );

    expect(nestedParentTexts).toEqual([
      "Marker character change forces new list start:",
    ]);
    expect(nestedLeafTexts).toEqual([
      "Ac tristique libero volutpat at",
      "Facilisis in pretium nisl aliquet",
      "Nulla volutpat aliquam velit",
    ]);
  });
});
