import { Marked, type MarkedExtension, type Tokens } from "marked";
import { resolveImageSrc } from "@/lib/attachments";
import { extractYouTubeVideoId } from "./youtube-utils";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Block-level extension: bare YouTube URLs on their own line become embeds.
 * Renders an <iframe data-lexical-youtube="videoId"> that YouTubeNode.importDOM
 * picks up.
 */
const youtubeExtension: MarkedExtension = {
  extensions: [
    {
      name: "youtube",
      level: "block",
      start(src) {
        return src.match(
          /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)/m,
        )?.index;
      },
      tokenizer(src) {
        const match =
          /^(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\S+)\n?/.exec(
            src,
          );
        if (match) {
          const videoId = extractYouTubeVideoId(match[1]);
          if (videoId) {
            return { type: "youtube", raw: match[0], videoId };
          }
        }
        return undefined;
      },
      renderer(token) {
        const { videoId } = token as Tokens.Generic & { videoId: string };
        return `<iframe data-lexical-youtube="${videoId}" width="560" height="315" src="https://www.youtube-nocookie.com/embed/${videoId}" frameborder="0" allowfullscreen="true" title="YouTube video"></iframe>\n`;
      },
    },
  ],
};

/**
 * Inline extension: ==highlighted text== → <mark>text</mark>
 * Marked doesn't support this natively; we need it for roundtrip fidelity
 * since our editor supports highlight via TEXT_FORMAT_TRANSFORMERS.
 */
const highlightExtension: MarkedExtension = {
  extensions: [
    {
      name: "highlight",
      level: "inline",
      start(src) {
        return src.indexOf("==");
      },
      tokenizer(src) {
        if (!src.startsWith("==")) return undefined;
        const content = src.slice(2);
        const endIdx = content.indexOf("==");
        if (endIdx > 0) {
          const text = content.slice(0, endIdx);
          return {
            type: "highlight",
            raw: `==${text}==`,
            text,
            tokens: this.lexer.inlineTokens(text),
          };
        }
        return undefined;
      },
      renderer(token) {
        const t = token as Tokens.Generic & { tokens: unknown[] };
        return `<mark>${this.parser.parseInline(t.tokens as Tokens.Generic[])}</mark>`;
      },
      childTokens: ["tokens"],
    },
  ],
};

/**
 * Renderer overrides to bridge marked's HTML output to what Lexical's
 * importDOM expects.
 */
const rendererOverrides: MarkedExtension = {
  renderer: {
    // Code blocks: Lexical's CodeNode.importDOM reads `data-language` from
    // <pre>. Emitting a bare <pre> avoids the nested <code> conversion path.
    code({ text, lang }: Tokens.Code) {
      const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
      const langAttr = lang ? ` data-language="${lang}"` : "";
      return `<pre${langAttr}>${escaped}</pre>\n`;
    },

    // Strikethrough: marked outputs <del>, Lexical's TextNode.importDOM
    // handles <s> but not <del>.
    del({ tokens }: Tokens.Del) {
      return `<s>${this.parser.parseInline(tokens)}</s>`;
    },

    link({ href, tokens, title }: Tokens.Link) {
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
      return `<a href="${escapeHtml(href)}"${titleAttr}>${this.parser.parseInline(tokens)}</a>`;
    },

    // Images: resolve attachment:// URIs for rendering.
    image({ href, title, text }: Tokens.Image) {
      const resolved = resolveImageSrc(href);
      const titleAttr = title ? ` title="${title}"` : "";
      return `<img src="${resolved}" alt="${text}"${titleAttr}>`;
    },

    // Checklists: Lexical's isDomChecklist() looks for "contains-task-list"
    // on <ul> and "task-list-item" on <li>. Marked doesn't add these classes.
    list({ items, ordered, start }: Tokens.List) {
      const hasCheckbox = items.some((item) => item.task);
      const tag = ordered ? "ol" : "ul";
      const startAttr = ordered && start !== 1 ? ` start="${start}"` : "";
      const checkClass = hasCheckbox ? ' class="contains-task-list"' : "";
      const body = items.map((item) => this.listitem(item)).join("");
      return `<${tag}${startAttr}${checkClass}>${body}</${tag}>\n`;
    },

    listitem({ tokens, task }: Tokens.ListItem) {
      // For task items, marked already includes a checkbox token in `tokens`.
      // We just need to add the "task-list-item" class for Lexical's
      // $convertListItemElement to detect the checked state.
      // No trailing \n — whitespace between </li> and <li> creates phantom
      // empty list items in Lexical's $normalizeChildren.
      const inner = this.parser.parse(tokens);
      if (task) {
        return `<li class="task-list-item">${inner}</li>`;
      }
      return `<li>${inner}</li>`;
    },
  },
};

/**
 * Preprocess hook to preserve blank lines as empty paragraphs. Marked treats
 * blank lines as paragraph separators and collapses them. We convert each
 * blank line into a <p><br></p> marker surrounded by blank lines so marked
 * still sees the block separators it needs. This matches Bear/Obsidian
 * behavior where every blank line is a visible, clickable empty paragraph.
 */
const emptyParagraphPreprocess: MarkedExtension = {
  hooks: {
    preprocess(markdown: string) {
      const lines = markdown.split("\n");
      const result: string[] = [];
      let fenceChar: string | null = null;
      let fenceLen = 0;

      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trimStart();

        // Track code fence state (proper fence matching)
        const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed);
        if (fenceMatch && !/^(`{3,})[^`]+\1$/.test(line)) {
          const char = fenceMatch[1][0];
          const len = fenceMatch[1].length;
          if (fenceChar === null) {
            fenceChar = char;
            fenceLen = len;
          } else if (char === fenceChar && len >= fenceLen) {
            fenceChar = null;
          }
          result.push(line);
          i++;
          continue;
        }

        // Inside code fence — preserve as-is
        if (fenceChar !== null) {
          result.push(line);
          i++;
          continue;
        }

        // Blank line group: first blank is the standard block separator
        // (needed for marked to recognize block boundaries). Each
        // additional blank becomes an empty paragraph marker.
        if (line.trim() === "") {
          let blankCount = 0;
          while (i < lines.length && lines[i].trim() === "") {
            blankCount++;
            i++;
          }
          // First blank = standard separator
          result.push("");
          // Additional blanks = empty paragraphs
          for (let j = 1; j < blankCount; j++) {
            result.push("<p><br></p>");
            result.push("");
          }
        } else {
          result.push(line);
          i++;
        }
      }

      return result.join("\n");
    },
  },
};

// ---------------------------------------------------------------------------
// Paste preprocess: every blank line becomes an empty paragraph (Bear behavior)
// ---------------------------------------------------------------------------

const pastePreprocess: MarkedExtension = {
  hooks: {
    preprocess(markdown: string) {
      const lines = markdown.split("\n");
      const result: string[] = [];
      let fenceChar: string | null = null;
      let fenceLen = 0;

      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trimStart();

        const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed);
        if (fenceMatch && !/^(`{3,})[^`]+\1$/.test(line)) {
          const char = fenceMatch[1][0];
          const len = fenceMatch[1].length;
          if (fenceChar === null) {
            fenceChar = char;
            fenceLen = len;
          } else if (char === fenceChar && len >= fenceLen) {
            fenceChar = null;
          }
          result.push(line);
          i++;
          continue;
        }

        if (fenceChar !== null) {
          result.push(line);
          i++;
          continue;
        }

        if (line.trim() === "") {
          let blankCount = 0;
          while (i < lines.length && lines[i].trim() === "") {
            blankCount++;
            i++;
          }
          // Every blank becomes an empty paragraph (Bear/Obsidian convention:
          // each blank line is a visible, clickable spacer in the editor)
          for (let j = 0; j < blankCount; j++) {
            result.push("");
            result.push("<p><br></p>");
          }
          result.push("");
        } else {
          result.push(line);
          i++;
        }
      }

      return result.join("\n");
    },
  },
};

// ---------------------------------------------------------------------------
// Configured Marked instances
// ---------------------------------------------------------------------------

// For loading stored notes: first blank line = separator, extras = empty paragraphs
const markedInstance = new Marked();
markedInstance.use(
  { gfm: true, breaks: true },
  youtubeExtension,
  highlightExtension,
  rendererOverrides,
  emptyParagraphPreprocess,
);

// For pasting external markdown: every blank line = empty paragraph
const markedInstanceForPaste = new Marked();
markedInstanceForPaste.use(
  { gfm: true, breaks: true },
  youtubeExtension,
  highlightExtension,
  rendererOverrides,
  pastePreprocess,
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const domParser = new DOMParser();

// Strip whitespace between block-level tags to prevent DOMParser from creating
// text nodes that Lexical interprets as empty paragraphs or phantom list items.
const BLOCK_WS_RE =
  />\s+<(\/?)(p|h[1-6]|ul|ol|li|pre|blockquote|table|thead|tbody|tr|th|td|hr|div|section)/g;

export function markdownToDOM(
  markdown: string,
  options?: { paste?: boolean },
): Document {
  const instance = options?.paste ? markedInstanceForPaste : markedInstance;
  const html = instance.parse(markdown) as string;
  return htmlToDOM(html);
}

export function htmlToDOM(html: string): Document {
  const cleaned = html.replace(BLOCK_WS_RE, "><$1$2");
  return domParser.parseFromString(
    `<!DOCTYPE html><html><body>${cleaned}</body></html>`,
    "text/html",
  );
}
