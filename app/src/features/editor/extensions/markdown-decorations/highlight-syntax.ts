import { tags } from "@lezer/highlight";
import { type MarkdownConfig } from "@lezer/markdown";

const HighlightDelim = { resolve: "Highlight", mark: "HighlightMark" };

/**
 * Lezer markdown extension that parses `==highlight==` syntax.
 * Follows the same pattern as the built-in Strikethrough extension.
 */
export const HighlightSyntax: MarkdownConfig = {
  defineNodes: [
    {
      name: "Highlight",
      style: { "Highlight/...": tags.special(tags.content) },
    },
    {
      name: "HighlightMark",
      style: tags.processingInstruction,
    },
  ],
  parseInline: [
    {
      name: "Highlight",
      parse(cx, next, pos) {
        // Must be `==` but not `===`
        if (
          next !== 61 /* '=' */ ||
          cx.char(pos + 1) !== 61 ||
          cx.char(pos + 2) === 61
        ) {
          return -1;
        }

        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(pos + 2, pos + 3);
        const sBefore = /\s|^$/.test(before);
        const sAfter = /\s|^$/.test(after);
        const pBefore = /[^\w\s]/.test(before);
        const pAfter = /[^\w\s]/.test(after);

        return cx.addDelimiter(
          HighlightDelim,
          pos,
          pos + 2,
          !sAfter && (!pAfter || sBefore || pBefore),
          !sBefore && (!pBefore || sAfter || pAfter),
        );
      },
      after: "Emphasis",
    },
  ],
};
