import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Tag } from "@lezer/highlight";
import type { MarkdownConfig } from "@lezer/markdown";

const tags = {
  hashtag: Tag.define(),
};

// Char codes for # and ＃ (fullwidth)
const HASH_CODES = new Set([35, 65_283]);

function isTagChar(code: number): boolean {
  // Letters, numbers, underscore, hyphen
  if (code >= 65 && code <= 90) return true; // A-Z
  if (code >= 97 && code <= 122) return true; // a-z
  if (code >= 48 && code <= 57) return true; // 0-9
  if (code === 95) return true; // _
  if (code === 45) return true; // -
  if (code === 47) return true; // /
  // Extended unicode letters
  if (code >= 192) return true;
  return false;
}

function isBoundaryChar(code: number): boolean {
  if (code === -1) return true; // start/end of line
  if (code === 32 || code === 9 || code === 10 || code === 13) return true; // whitespace
  if (code === 40) return true; // (
  return false;
}

const TagGrammar: MarkdownConfig = {
  defineNodes: [
    {
      name: "Hashtag",
      style: tags.hashtag,
    },
  ],
  parseInline: [
    {
      name: "Hashtag",
      parse(cx, charCode, pos) {
        // Must be a hash character
        if (!HASH_CODES.has(charCode)) {
          return -1;
        }

        // Next char must not be a hash (reject ## headings)
        const next = cx.char(pos + 1);
        if (HASH_CODES.has(next) || next === -1) {
          return -1;
        }

        // Must be at boundary (start of line, after whitespace or paren)
        const prev = pos > cx.offset ? cx.char(pos - 1) : -1;
        if (!isBoundaryChar(prev)) {
          return -1;
        }

        // First char after # must be a tag char (not space)
        if (!isTagChar(next)) {
          return -1;
        }

        // Scan forward to find the end of the tag
        let end = pos + 2;
        while (end < cx.end) {
          const ch = cx.char(end);
          if (!isTagChar(ch)) {
            break;
          }
          end++;
        }

        // Must have at least one char after #
        if (end <= pos + 1) {
          return -1;
        }

        return cx.addElement(cx.elt("Hashtag", pos, end));
      },
      after: "Emphasis",
    },
  ],
};

const tagHighlightStyle = syntaxHighlighting(
  HighlightStyle.define([
    {
      tag: tags.hashtag,
      backgroundColor: "var(--accent)",
      color: "var(--accent-foreground)",
      borderRadius: "0.25rem",
      padding: "0 0.25rem",
    },
  ]),
);

export { TagGrammar, tagHighlightStyle };
