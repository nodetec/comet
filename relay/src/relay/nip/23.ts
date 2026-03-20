import type { NostrEvent } from "../../types";

export const KIND_LONG_FORM = 30023;
export const KIND_LONG_FORM_DRAFT = 30024;

export function isLongFormEvent(event: NostrEvent): boolean {
  return event.kind === KIND_LONG_FORM || event.kind === KIND_LONG_FORM_DRAFT;
}

/**
 * Validate NIP-23 specific rules for long-form content events.
 * Returns null if valid, or a rejection reason string.
 */
export function validateLongFormEvent(event: NostrEvent): string | null {
  if (!isLongFormEvent(event)) {
    return null;
  }

  // Must have a d tag for addressability
  const dTag = event.tags.find(([t]) => t === "d");
  if (!dTag || dTag.length < 2) {
    return "invalid: long-form event must have a 'd' tag";
  }

  // Content must not contain HTML tags (per NIP-23: MUST NOT support adding HTML to Markdown)
  if (containsHtml(event.content)) {
    return "invalid: long-form content must not contain HTML";
  }

  // published_at tag must be a valid unix timestamp if present
  const publishedAt = event.tags.find(([t]) => t === "published_at");
  if (publishedAt && publishedAt.length >= 2) {
    const ts = parseInt(publishedAt[1], 10);
    if (isNaN(ts) || ts < 0) {
      return "invalid: published_at must be a valid unix timestamp";
    }
  }

  return null;
}

/** Extract structured metadata from a long-form event's tags. */
export function extractArticleMetadata(event: NostrEvent): ArticleMetadata {
  const getTag = (name: string) =>
    event.tags.find(([t]) => t === name)?.[1] ?? undefined;

  return {
    dTag: getTag("d") ?? "",
    title: getTag("title"),
    image: getTag("image"),
    summary: getTag("summary"),
    publishedAt: getTag("published_at")
      ? parseInt(getTag("published_at")!, 10)
      : undefined,
    hashtags: event.tags.filter(([t]) => t === "t").map(([, v]) => v),
    isDraft: event.kind === KIND_LONG_FORM_DRAFT,
  };
}

export type ArticleMetadata = {
  dTag: string;
  title?: string;
  image?: string;
  summary?: string;
  publishedAt?: number;
  hashtags: string[];
  isDraft: boolean;
};

/**
 * Detect HTML in markdown content.
 * Matches opening/closing/self-closing HTML tags but ignores code blocks and inline code.
 */
function containsHtml(content: string): boolean {
  // Strip fenced code blocks
  const withoutCodeBlocks = content.replace(/```[\s\S]*?```/g, "");
  // Strip inline code
  const withoutInlineCode = withoutCodeBlocks.replace(/`[^`]+`/g, "");
  // Check for HTML tags (opening, closing, or self-closing)
  return /<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s[^>]*)?\/?>/m.test(withoutInlineCode);
}
