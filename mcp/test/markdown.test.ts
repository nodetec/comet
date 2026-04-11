import { describe, expect, test } from "bun:test";
import {
  extractTags,
  previewFromMarkdown,
  titleFromMarkdown,
} from "../src/lib/markdown";

describe("extractTags", () => {
  test("ignores code blocks and deduplicates sorted", () => {
    const markdown = [
      "#Tag #tag-two #123 #Tag",
      "",
      "Inline `#ignored` and ``#also_ignored``",
      "",
      "```rust",
      "#not-a-tag",
      "```",
      "",
      "~~~bash",
      "#still-not-a-tag",
      "~~~",
      "",
      "#real_tag",
    ].join("\n");

    expect(extractTags(markdown)).toEqual(["real_tag", "tag", "tag-two"]);
  });

  test("ignores markdown link destinations", () => {
    const markdown = [
      "- [ ] context: An anchor link to [the table section](#tables).",
      "",
      "Visible tag in prose: #trail",
      "",
      "[#visible-link-text](https://example.com/path#fragment)",
    ].join("\n");

    expect(extractTags(markdown)).toEqual(["trail", "visible-link-text"]);
  });

  test("extracts basic tags", () => {
    expect(extractTags("Hello #world")).toEqual(["world"]);
  });

  test("skips purely numeric tags", () => {
    expect(extractTags("#123 #abc #456")).toEqual(["abc"]);
  });

  test("lowercases tags", () => {
    expect(extractTags("#Hello #WORLD")).toEqual(["hello", "world"]);
  });

  test("handles tags with hyphens and underscores", () => {
    expect(extractTags("#my-tag #my_tag")).toEqual(["my-tag", "my_tag"]);
  });

  test("does not match hash preceded by tag char", () => {
    expect(extractTags("foo#bar")).toEqual([]);
  });

  test("handles empty markdown", () => {
    expect(extractTags("")).toEqual([]);
  });

  test("handles markdown with no tags", () => {
    expect(extractTags("Just some plain text")).toEqual([]);
  });
});

describe("titleFromMarkdown", () => {
  test("extracts first H1", () => {
    expect(titleFromMarkdown("\n\n# Trail Note\n\n## Section\nBody")).toBe(
      "Trail Note",
    );
  });

  test("returns empty for no heading", () => {
    expect(titleFromMarkdown("Just text\nMore text")).toBe("");
  });

  test("ignores H2 headings", () => {
    expect(titleFromMarkdown("## Not a title")).toBe("");
  });

  test("skips empty H1", () => {
    expect(titleFromMarkdown("# \n# Real Title")).toBe("Real Title");
  });

  test("handles empty markdown", () => {
    expect(titleFromMarkdown("")).toBe("");
  });
});

describe("previewFromMarkdown", () => {
  test("skips title, images, rules, and code blocks", () => {
    const markdown = [
      "# Trail Note",
      "",
      "![diagram](attachment://hash.png)",
      "---",
      "```rust",
      "let hidden = true;",
      "```",
      "",
      "> Quoted context",
      "- [x] Done item",
      "Regular [link](https://example.com) text",
    ].join("\n");

    const preview = previewFromMarkdown(markdown);
    expect(preview).toContain("Quoted context");
    expect(preview).toContain("Done item");
    expect(preview).toContain("Regular link text");
    expect(preview).not.toContain("Trail Note");
    expect(preview).not.toContain("diagram");
    expect(preview).not.toContain("hidden");
  });

  test("truncates to 140 characters", () => {
    const long = `# Title\n\n${"A".repeat(200)}`;
    const preview = previewFromMarkdown(long);
    expect([...preview].length).toBeLessThanOrEqual(140);
  });

  test("handles empty markdown", () => {
    expect(previewFromMarkdown("")).toBe("");
  });
});
