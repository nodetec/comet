import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Tag } from "@lezer/highlight";
import type { MarkdownConfig } from "@lezer/markdown";

const tags = {
  wikilink: Tag.define(),
};

function isSquareBracketEscaped(
  cx: Parameters<
    NonNullable<MarkdownConfig["parseInline"]>[number]["parse"]
  >[0],
  pos: number,
) {
  let slashCount = 0;
  let current = pos;

  while (current > 0 && cx.char(current - 1) === 92) {
    slashCount += 1;
    current -= 1;
  }

  return slashCount % 2 === 1;
}

const WikiLinkGrammar: MarkdownConfig = {
  defineNodes: [
    {
      name: "WikiLink",
      style: tags.wikilink,
    },
  ],
  parseInline: [
    {
      name: "WikiLink",
      parse(cx, charCode, pos) {
        if (
          charCode !== 91 ||
          cx.char(pos + 1) !== 91 ||
          isSquareBracketEscaped(cx, pos)
        ) {
          return -1;
        }

        let end = pos + 2;
        while (end + 1 < cx.end) {
          const character = cx.char(end);
          if (character === 10 || character === 13) {
            return -1;
          }

          if (character === 93 && cx.char(end + 1) === 93) {
            const title = cx.slice(pos + 2, end).trim();
            if (!title || title.includes("[") || title.includes("]")) {
              return -1;
            }

            return cx.addElement(cx.elt("WikiLink", pos, end + 2));
          }

          end += 1;
        }

        return -1;
      },
      after: "Emphasis",
    },
  ],
};

const wikilinkHighlightStyle = syntaxHighlighting(
  HighlightStyle.define([
    {
      tag: tags.wikilink,
      color: "var(--primary)",
    },
  ]),
);

export { WikiLinkGrammar, wikilinkHighlightStyle };
