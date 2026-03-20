import { describe, test, expect } from "bun:test";
import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
} from "nostr-tools/pure";
import type { NostrEvent } from "../src/types";
import {
  validateLongFormEvent,
  extractArticleMetadata,
  isLongFormEvent,
  KIND_LONG_FORM,
  KIND_LONG_FORM_DRAFT,
} from "../src/relay/nip/23";

const sk = generateSecretKey();
getPublicKey(sk);

function createArticleEvent(
  overrides: Partial<{
    kind: number;
    content: string;
    tags: string[][];
  }> = {},
): NostrEvent {
  return finalizeEvent(
    {
      kind: overrides.kind ?? KIND_LONG_FORM,
      content:
        overrides.content ??
        "# Hello World\n\nThis is a **long-form** article with [links](https://example.com).\n\n## Section 2\n\nMore content here.",
      tags: overrides.tags ?? [
        ["d", "hello-world"],
        ["title", "Hello World"],
        ["summary", "A test article"],
        ["published_at", "1700000000"],
        ["t", "test"],
        ["t", "nostr"],
      ],
      created_at: Math.floor(Date.now() / 1000),
    },
    sk,
  ) as unknown as NostrEvent;
}

describe("isLongFormEvent", () => {
  test("identifies kind 30023", () => {
    expect(isLongFormEvent(createArticleEvent())).toBe(true);
  });

  test("identifies kind 30024 drafts", () => {
    expect(
      isLongFormEvent(createArticleEvent({ kind: KIND_LONG_FORM_DRAFT })),
    ).toBe(true);
  });

  test("rejects other kinds", () => {
    expect(isLongFormEvent(createArticleEvent({ kind: 1 }))).toBe(false);
  });
});

describe("validateLongFormEvent", () => {
  test("accepts valid article", () => {
    expect(validateLongFormEvent(createArticleEvent())).toBeNull();
  });

  test("accepts valid draft", () => {
    const draft = createArticleEvent({
      kind: KIND_LONG_FORM_DRAFT,
      tags: [["d", "my-draft"]],
    });
    expect(validateLongFormEvent(draft)).toBeNull();
  });

  test("skips non-long-form events", () => {
    const regular = createArticleEvent({ kind: 1 });
    expect(validateLongFormEvent(regular)).toBeNull();
  });

  test("rejects missing d tag", () => {
    const event = createArticleEvent({ tags: [["title", "No D Tag"]] });
    expect(validateLongFormEvent(event)).toContain("'d' tag");
  });

  test("rejects HTML in content", () => {
    const event = createArticleEvent({
      content: "# Title\n\n<div>This has HTML</div>\n\nMore text.",
    });
    expect(validateLongFormEvent(event)).toContain("HTML");
  });

  test("rejects self-closing HTML tags", () => {
    const event = createArticleEvent({
      content: "An image: <img src='x' />\n\nDone.",
    });
    expect(validateLongFormEvent(event)).toContain("HTML");
  });

  test("allows angle brackets in code blocks", () => {
    const event = createArticleEvent({
      content: "# Code Example\n\n```html\n<div>code</div>\n```\n\nEnd.",
    });
    expect(validateLongFormEvent(event)).toBeNull();
  });

  test("allows angle brackets in inline code", () => {
    const event = createArticleEvent({
      content: "Use `<div>` for containers.",
    });
    expect(validateLongFormEvent(event)).toBeNull();
  });

  test("allows non-HTML angle brackets", () => {
    const event = createArticleEvent({
      content: "Math: 1 < 2 and 3 > 2.\n\nArrows: -> and <-",
    });
    expect(validateLongFormEvent(event)).toBeNull();
  });

  test("rejects invalid published_at", () => {
    const event = createArticleEvent({
      tags: [
        ["d", "test"],
        ["published_at", "not-a-number"],
      ],
    });
    expect(validateLongFormEvent(event)).toContain("published_at");
  });
});

describe("extractArticleMetadata", () => {
  test("extracts all metadata fields", () => {
    const event = createArticleEvent();
    const meta = extractArticleMetadata(event);

    expect(meta.dTag).toBe("hello-world");
    expect(meta.title).toBe("Hello World");
    expect(meta.summary).toBe("A test article");
    expect(meta.publishedAt).toBe(1700000000);
    expect(meta.hashtags).toEqual(["test", "nostr"]);
    expect(meta.isDraft).toBe(false);
    expect(meta.image).toBeUndefined();
  });

  test("identifies drafts", () => {
    const draft = createArticleEvent({
      kind: KIND_LONG_FORM_DRAFT,
      tags: [["d", "draft-1"]],
    });
    expect(extractArticleMetadata(draft).isDraft).toBe(true);
  });

  test("handles missing optional fields", () => {
    const event = createArticleEvent({
      tags: [["d", "minimal"]],
    });
    const meta = extractArticleMetadata(event);
    expect(meta.dTag).toBe("minimal");
    expect(meta.title).toBeUndefined();
    expect(meta.summary).toBeUndefined();
    expect(meta.publishedAt).toBeUndefined();
    expect(meta.hashtags).toEqual([]);
  });
});
