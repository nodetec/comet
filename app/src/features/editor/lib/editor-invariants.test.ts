// @vitest-environment jsdom

import fixtures from "@/shared/lib/editor-invariant-fixtures.json";
import { CodeNode } from "@lexical/code";
import { CometHorizontalRuleNode } from "../nodes/comet-horizontal-rule-node";
import { ListAnchorNode } from "../nodes/list-anchor-node";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import { $getRoot, createEditor } from "lexical";
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
import { CLIPBOARD_TRANSFORMERS, TRANSFORMERS } from "../transformers";
import {
  $exportMarkdown,
  $exportMarkdownForClipboard,
  $importMarkdownFromHTML,
  $importMarkdownToLexical,
} from "./markdown";

type SharedInvariantFixture = {
  description: string;
  html: string;
  id: string;
  markdown: string;
  skipClipboardRoundtrip?: boolean;
  skipLexicalRoundtrip?: boolean;
  support: "lossless" | "normalized" | "unsupported";
  title: string;
};

const allFixtures = fixtures.cases as SharedInvariantFixture[];

const TEST_NODES = [
  CodeNode,
  HeadingNode,
  CometHorizontalRuleNode,
  ListAnchorNode,
  ImageNode,
  LinkNode,
  AutoLinkNode,
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
    namespace: "editor-invariants-test",
    nodes: TEST_NODES,
    onError: (error) => {
      throw error;
    },
  });
}

function roundtripMarkdown(markdown: string): string {
  const editor = createTestEditor();
  let output = "";

  editor.update(
    () => {
      $importMarkdownToLexical(markdown, TRANSFORMERS);
      output = $exportMarkdown(TRANSFORMERS);
    },
    { discrete: true },
  );

  return output;
}

function roundtripMarkdownThroughHtmlImport(
  markdown: string,
  html: string,
): string {
  const editor = createTestEditor();
  let output = "";

  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      $importMarkdownFromHTML(html, markdown);
      output = $exportMarkdown(TRANSFORMERS);
    },
    { discrete: true },
  );

  return output;
}

function exportClipboardMarkdown(markdown: string): string {
  const editor = createTestEditor();
  let output = "";

  editor.update(
    () => {
      $importMarkdownToLexical(markdown, TRANSFORMERS);
      output = $exportMarkdownForClipboard(CLIPBOARD_TRANSFORMERS);
    },
    { discrete: true },
  );

  return output;
}

const losslessFixtures = allFixtures.filter(
  (fixture) => fixture.support === "lossless",
);
const lexicalLosslessFixtures = losslessFixtures.filter(
  (fixture) => fixture.skipLexicalRoundtrip !== true,
);
const clipboardLosslessFixtures = losslessFixtures.filter(
  (fixture) => fixture.skipClipboardRoundtrip !== true,
);

describe("editor invariants", () => {
  it.each(lexicalLosslessFixtures)(
    "preserves markdown through Lexical round-trip: $id",
    (fixture) => {
      expect(roundtripMarkdown(fixture.markdown)).toBe(fixture.markdown);
    },
  );

  it.each(losslessFixtures)(
    "preserves markdown through HTML import round-trip: $id",
    (fixture) => {
      expect(
        roundtripMarkdownThroughHtmlImport(fixture.markdown, fixture.html),
      ).toBe(fixture.markdown);
    },
  );

  it.each(clipboardLosslessFixtures)(
    "preserves markdown through clipboard export: $id",
    (fixture) => {
      expect(exportClipboardMarkdown(fixture.markdown)).toBe(fixture.markdown);
    },
  );

  it("imports nested blockquote HTML as nested quote nodes", () => {
    const fixture = losslessFixtures.find(
      (candidate) => candidate.id === "blockquote-nested",
    );
    expect(fixture).toBeDefined();
    if (!fixture) {
      return;
    }

    const editor = createTestEditor();
    let topLevelTypes: string[] = [];
    let outerChildTypes: string[] = [];
    let innerChildTypes: string[] = [];

    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        $importMarkdownFromHTML(fixture.html, fixture.markdown);

        const outer = root.getFirstChild();
        topLevelTypes = root.getChildren().map((child) => child.getType());
        if (!(outer instanceof QuoteNode)) {
          return;
        }

        outerChildTypes = outer.getChildren().map((child) => child.getType());
        const inner = outer
          .getChildren()
          .find((child): child is QuoteNode => child instanceof QuoteNode);
        if (!inner) {
          return;
        }

        innerChildTypes = inner.getChildren().map((child) => child.getType());
      },
      { discrete: true },
    );

    expect(topLevelTypes).toEqual(["quote"]);
    expect(outerChildTypes).toContain("quote");
    expect(innerChildTypes).toContain("quote");
  });
});
