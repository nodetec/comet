import { $convertFromMarkdownString } from "@lexical/markdown";
import { $createCodeNode, CodeNode } from "@lexical/code";
import { HorizontalRuleNode } from "@lexical/extension";
import { LinkNode, $createLinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { HeadingNode, QuoteNode, $createQuoteNode } from "@lexical/rich-text";
import {
  TableCellNode,
  TableNode,
  TableRowNode,
} from "@lexical/table";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
} from "lexical";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
  invoke: vi.fn(),
}));

vi.mock("@/lib/attachments", () => ({
  resolveImageSrc: (src: string) =>
    src.startsWith("attachment://")
      ? `asset:///attachments/${src.slice("attachment://".length)}`
      : src,
  unresolveImageSrc: (src: string) =>
    src.startsWith("asset:///attachments/")
      ? `attachment://${src.slice("asset:///attachments/".length)}`
      : src,
}));

import { $createImageNode, ImageNode } from "../nodes/image-node";
import { $createYouTubeNode, YouTubeNode } from "../nodes/youtube-node";
import { TRANSFORMERS } from "../transformers";
import {
  $exportMarkdown,
  $exportMarkdownForClipboard,
  normalizeImportedCodeBlocksFromMarkdown,
} from "./markdown";

const TEST_NODES = [
  CodeNode,
  HeadingNode,
  HorizontalRuleNode,
  ImageNode,
  LinkNode,
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
    namespace: "markdown-test",
    nodes: TEST_NODES,
    onError: (error) => {
      throw error;
    },
  });
}

function exportMarkdownFromEditor(
  setup: (root: ReturnType<typeof $getRoot>) => void,
): string {
  const editor = createTestEditor();
  let output = "";

  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      setup(root);
      output = $exportMarkdown(TRANSFORMERS);
    },
    { discrete: true },
  );

  return output;
}

function exportClipboardMarkdownFromEditor(
  setup: (root: ReturnType<typeof $getRoot>) => void,
): string {
  const editor = createTestEditor();
  let output = "";

  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      setup(root);
      output = $exportMarkdownForClipboard(TRANSFORMERS);
    },
    { discrete: true },
  );

  return output;
}

function roundtripMarkdown(markdown: string): string {
  const editor = createTestEditor();
  let output = "";

  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      $convertFromMarkdownString(markdown, TRANSFORMERS);
      output = $exportMarkdown(TRANSFORMERS);
    },
    { discrete: true },
  );

  return output;
}

describe("markdown editor pipeline", () => {
  it("restores duplicate code blocks using source order", () => {
    const editor = createTestEditor();
    let firstText = "";
    let secondText = "";

    editor.update(
      () => {
        const root = $getRoot();
        const first = $createCodeNode("rust");
        first.append($createTextNode("fn same() {}"));
        const second = $createCodeNode("rust");
        second.append($createTextNode("fn same() {}"));
        root.append(first, second);

        normalizeImportedCodeBlocksFromMarkdown(
          root.getChildren(),
          [
            "```rust",
            "fn same() {}",
            "",
            "",
            "```",
            "",
            "```rust",
            "fn same() {}",
            "```",
          ].join("\n"),
        );

        firstText = first.getTextContent();
        secondText = second.getTextContent();
      },
      { discrete: true },
    );

    expect(firstText).toBe("fn same() {}\n\n");
    expect(secondText).toBe("fn same() {}");
  });

  it("collapses storage-only blank paragraphs on clipboard export", () => {
    const markdown = exportClipboardMarkdownFromEditor((root) => {
      const before = $createParagraphNode();
      before.append($createTextNode("A"));
      const extraGapBefore = $createParagraphNode();
      const code = $createCodeNode();
      code.append($createTextNode("x"));
      const extraGapAfter = $createParagraphNode();
      const after = $createParagraphNode();
      after.append($createTextNode("B"));
      root.append(before, extraGapBefore, code, extraGapAfter, after);
    });

    expect(markdown).toBe(["A", "", "```", "x", "```", "", "B"].join("\n"));
  });

  it("preserves trailing blank lines inside code fences on clipboard export", () => {
    const markdown = exportClipboardMarkdownFromEditor((root) => {
      const code = $createCodeNode("rust");
      code.append($createTextNode("fn main() {}\n\n"));
      root.append(code);
    });

    expect(markdown).toBe(
      ["```rust", "fn main() {}", "", "", "```"].join("\n"),
    );
  });

  it("preserves paragraph breaks inside blockquotes", () => {
    const markdown = exportMarkdownFromEditor((root) => {
      const quote = $createQuoteNode();
      const first = $createParagraphNode();
      first.append($createTextNode("first"));
      const empty = $createParagraphNode();
      const second = $createParagraphNode();
      second.append($createTextNode("second"));
      quote.append(first, empty, second);
      root.append(quote);
    });

    expect(markdown).toBe(["> first", ">", "> second"].join("\n"));
  });

  it("exports plain email autolinks as bare email text", () => {
    const markdown = exportMarkdownFromEditor((root) => {
      const paragraph = $createParagraphNode();
      const link = $createLinkNode("mailto:user@example.com");
      link.append($createTextNode("user@example.com"));
      paragraph.append(link);
      root.append(paragraph);
    });

    expect(markdown).toBe("user@example.com");
  });

  it("round-trips markdown links with titles", () => {
    expect(
      roundtripMarkdown('[Open docs](https://example.com "Docs")'),
    ).toBe('[Open docs](https://example.com "Docs")');
  });

  it("exports code blocks with longer fences when content contains backticks", () => {
    const markdown = exportMarkdownFromEditor((root) => {
      const code = $createCodeNode("rust");
      code.append($createTextNode('const fence = "```";'));
      root.append(code);
    });

    expect(markdown).toBe('````rust\nconst fence = "```";\n````');
  });

  it("round-trips code blocks with trailing blank lines", () => {
    expect(roundtripMarkdown("```rust\nfn main() {}\n\n```")).toBe(
      "```rust\nfn main() {}\n\n```",
    );
  });

  it("normalizes table divider rows on export", () => {
    expect(
      roundtripMarkdown(
        ["| A | B |", "|---------|------------|", "| 1 | 2 |"].join("\n"),
      ),
    ).toBe(["| A | B |", "| --- | --- |", "| 1 | 2 |"].join("\n"));
  });

  it("pads uneven table rows on export", () => {
    expect(
      roundtripMarkdown(
        ["| A | B |", "| --- | --- |", "| 1 |"].join("\n"),
      ),
    ).toBe(["| A | B |", "| --- | --- |", "| 1 |  |"].join("\n"));
  });

  it("preserves escaped newlines inside table cells", () => {
    expect(
      roundtripMarkdown(["| A |", "| --- |", "| line1\\nline2 |"].join("\n")),
    ).toBe(["| A |", "| --- |", "| line1\\nline2 |"].join("\n"));
  });

  it("preserves markdown formatting inside table cells", () => {
    expect(
      roundtripMarkdown(
        ["| A | B |", "| --- | --- |", "| **bold** | *italic* |"].join("\n"),
      ),
    ).toBe(
      ["| A | B |", "| --- | --- |", "| **bold** | *italic* |"].join("\n"),
    );
  });

  it("exports attachment images back to attachment markdown", () => {
    const markdown = exportMarkdownFromEditor((root) => {
      const paragraph = $createParagraphNode();
      paragraph.append(
        $createImageNode({
          altText: "diagram (v2)",
          src: "asset:///attachments/diagram-v2.png",
        }),
      );
      root.append(paragraph);
    });

    expect(markdown).toBe("![diagram (v2)](attachment://diagram-v2.png)");
  });

  it("exports YouTube nodes as canonical watch URLs", () => {
    const markdown = exportMarkdownFromEditor((root) => {
      const paragraph = $createParagraphNode();
      paragraph.append($createYouTubeNode("dQw4w9WgXcQ"));
      root.append(paragraph);
    });

    expect(markdown).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });
});
