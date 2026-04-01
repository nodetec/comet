// @vitest-environment jsdom

import fixtures from "@/shared/lib/editor-paste-fixtures.json";
import { $generateNodesFromDOM } from "@lexical/html";
import { CodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
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
  normalizeImportedCodeBlocksFromMarkdown,
  normalizeImportedNodes,
  $exportMarkdown,
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
          const dom = htmlToDOM(fixture.html);
          const allNodes = normalizeImportedNodes(
            $generateNodesFromDOM(editor, dom),
          );
          normalizeImportedCodeBlocksFromMarkdown(allNodes, fixture.markdown);
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
