import { Decoration } from "@codemirror/view";

import { canonicalizeTagPath } from "@/features/editor/lib/tags";
import type {
  BuilderContext,
  DecorationEntry,
} from "@/features/editor/extensions/markdown-decorations/types";

const tagMark = Decoration.mark({ class: "cm-md-tag" });

// Simple tag: #word or #word/child (no spaces)
const SIMPLE_TAG_RE =
  /(?<=^|[\s(])(#[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*)(?=[\s,.;:!?)}\]]|$)/gu;

// Wrapped tag: #content with spaces# (content must not start/end with whitespace)
const WRAPPED_TAG_RE =
  /(?<=^|[\s(])(#[^\s#](?:[^\r\n#]*[^\s#])?#)(?=[^\p{L}\p{N}_/:.]+|$)/gu;

type TagRange = { from: number; to: number };

export function findAllTags(text: string, baseOffset: number): TagRange[] {
  const tags: TagRange[] = [];

  const wrappedRanges = new Set<string>();
  WRAPPED_TAG_RE.lastIndex = 0;
  let m;
  while ((m = WRAPPED_TAG_RE.exec(text)) !== null) {
    const raw = m[1]!;
    const inner = raw.slice(1, -1);
    if (canonicalizeTagPath(inner)) {
      const from = baseOffset + m.index + (m[0].length - raw.length);
      const to = from + raw.length;
      tags.push({ from, to });
      wrappedRanges.add(`${from}:${to}`);
    }
  }

  SIMPLE_TAG_RE.lastIndex = 0;
  while ((m = SIMPLE_TAG_RE.exec(text)) !== null) {
    const raw = m[1]!;
    const inner = raw.slice(1);
    if (canonicalizeTagPath(inner)) {
      const from = baseOffset + m.index + (m[0].length - raw.length);
      const to = from + raw.length;
      const key = `${from}:${to}`;
      if (!wrappedRanges.has(key)) {
        tags.push({ from, to });
      }
    }
  }

  // eslint-disable-next-line unicorn/no-array-sort
  return [...tags].sort(
    (a: TagRange, b: TagRange) => a.from - b.from || a.to - b.to,
  );
}

export function addTagDecorations(
  ctx: BuilderContext,
  out: DecorationEntry[],
): void {
  for (const { from, to } of ctx.view.visibleRanges) {
    const startLine = ctx.state.doc.lineAt(from);
    const endLine = ctx.state.doc.lineAt(to);

    for (let n = startLine.number; n <= endLine.number; n++) {
      const line = ctx.state.doc.line(n);
      for (const tag of findAllTags(line.text, line.from)) {
        out.push({ from: tag.from, to: tag.to, decoration: tagMark });
      }
    }
  }
}
